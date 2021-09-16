/*
    DynamoDB Metrics - Detailed DynamoDB Single Table metrics
*/

const DefaultConfig = {
    chan: 'metrics',
    dimensions: ['Table', 'Tenant', 'Source', 'Index', 'Model', 'Operation'],
    enable: true,
    env: false,
    hot: false,
    indexes: {primary: {hash: 'pk', sort: 'sk'}},
    max: 100,                                                       //  Buffer metrics for 100 requests
    namespace: 'SingleTable/Metrics.1',                             //  Default custom metric namespace
    period: 30,                                                     //  or buffer for 30 seconds
    queries: true,
    separator: '#',
    source: process.env.AWS_LAMBDA_FUNCTION_NAME || 'Default',      //  Default source name
    tenant: null,
}

const ReadWrite = {
    batchGet: 'read',
    batchWrite: 'write',
    deleteItem: 'write',
    getItem: 'read',
    putItem: 'write',
    query: 'read',
    scan: 'read',
    transactGet: 'read',
    transactWrite: 'write',
    updateItem: 'write',
}

const V3Ops = {
    BatchGetItemCommand: 'batchGet',
    BatchWriteItemCommand: 'batchWrite',
    CreateTableCommand: 'createTable',
    DeleteTableCommand: 'deleteTable',
    DeleteItemCommand: 'deleteItem',
    GetItemCommand: 'getItem',
    PutItemCommand: 'putItem',
    QueryCommand: 'query',
    transactGetCommand: 'transactGet',
    transactWrite: 'transactWrite',
    ScanCommand: 'scan',
    UpdateItemCommand: 'updateItem',
}

export default class Metrics {

    constructor(params = {}) {
        this.params = params = Object.assign(DefaultConfig, params)
        this.indexes = params.indexes || {}
        this.source = params.source
        this.tenant = params.tenant
        this.max = params.max
        this.period = (params.period || 30) * 1000
        this.namespace = params.namespace
        this.separator = params.separator
        this.queries = params.queries
        this.hot = params.hot
        this.log = params.senselogs
        this.enable = params.enable != null ? params.enable : true

        this.count = 0
        this.lastFlushed = Date.now()
        this.tree = {}

        this.test = params.test
        if (this.test) {
            this.output = []
        }
        if (params.env && process.env) {
            let key = params.env != true ? params.env : 'LOG_FILTER'
            let filter = process.env[key]
            if (filter.indexOf('dbmetrics') < 0) {
                this.enable = false
            }
        }
        if (!this.enable) {
            return
        }
        this.dimensions = params.dimensions
        //  LEGACY (was object)
        if (!Array.isArray(this.dimensions)) {
            this.dimensions = Object.keys(this.dimensions)
        }
        this.dimensionMap = {}
        for (let dim of this.dimensions) {
            this.dimensionMap[dim] = true
        }

        let client = this.client = params.client
        if (client.middlewareStack) {
            //  V3
            client.middlewareStack.add((next) => async (args) => {
                let started = new Date()
                let params = args.input

                let operation = V3Ops[args.constructor.name]
                /* istanbul ignore next */
                if (!operation) {
                    console.error(`Cannot determine operation for ${args.constructor.name}`, args)
                } else {
                    this.request(operation, params)
                }
                let result = await next(args)

                /* istanbul ignore next */
                if (operation) {
                    if (result.output) {
                        this.response(operation, params, result.output, started)
                    } else {
                        //  FUTURE - count errors
                    }
                }
                return result
            }, {step: 'initialize', name: 'dynamodb-metrics'})

        } else {
            //  V2
            client.service.customizeRequests(req => {
                let started = new Date()
                /* istanbul ignore next */
                if (req.on) {
                    let profile = req.params.profile
                    req.on('complete', res => {
                        if (res.error) {
                            //  Could log these errors
                        } else if (res.data) {
                            req.params.profile = profile
                            this.response(req.operation, req.params, res.data, started)
                        }
                    })
                }
                this.request(req.operation, req.params)
            })
        }
    }

    destroy() {
        if (this.client.middlewareStack) {
            this.client.middlewareStack.remove('dynamodb-metrics')
        }
    }

    request(operation, params) {
        if (ReadWrite[operation]) {
            params.ReturnConsumedCapacity = 'TOTAL'         // INDEXES | TOTAL | NONE
            //params.ReturnItemCollectionMetrics = 'SIZE'
        }
    }

    response(operation, params, result, started) {
        let model = this.getModel(params, result)
        let capacity = 0
        let tableName = params.TableName
        let consumed = result.ConsumedCapacity
        if (consumed) {
            //  Batch and transaction return array
            if (Array.isArray(consumed)) {
                for (let item of consumed) {
                    //  Only supporting single tables at the moment
                    tableName = item.TableName
                    capacity += item.CapacityUnits
                }
            } else {
                capacity = consumed.CapacityUnits
            }
        }
        let timestamp = Date.now()
        let values = {
            operation,
            count: result.Count || 1,
            scanned: result.ScannedCount || 1,
            latency: timestamp - started,
            capacity,
        }

        let dimensions = {}
        let map = this.dimensionMap

        if (map.Table) {
            dimensions.Table = tableName
        }
        if (map.Tenant && this.tenant) {
            dimensions.Tenant = this.tenant
        }
        if (map.Source && this.source) {
            dimensions.Source = this.source
        }
        if (map.Index) {
            dimensions.Index = params.IndexName || 'primary'
        }
        if (map.Model) {
            dimensions.Model = model
        }
        if (map.Operation) {
            dimensions.Operation = operation
        }
        //  FUTURE
        if (this.queries && params.profile) {
            this.tree.Profile = this.tree.Profile || {}
            this.addMetric(this.tree.Profile, values, 'Profile', params.profile)
        }
        this.addMetricGroup(this.tree, values, dimensions)

        if (++this.count >= this.max || (this.lastFlushed + this.period) < timestamp) {
            this.flush(timestamp, this.tree)
            this.count = 0
            this.lastFlushed = timestamp
        }
    }

    addMetricGroup(tree, values, dimensions) {
        for (let name of this.dimensions) {
            let dimension = dimensions[name]
            if (dimension) {
                tree = tree[name] = tree[name] || {}
                this.addMetric(tree, values, name, dimension)
                tree = tree[dimension]
            }
        }
    }

    addMetric(tree, values, name, dimension) {
        let {operation, capacity, count, latency, scanned} = values
        let item = tree[dimension] = tree[dimension] || {
            counters: {count: 0, latency: 0, read: 0, requests: 0, scanned: 0, write: 0}
        }
        let counters = item.counters
        counters[ReadWrite[operation]] += capacity      //  RCU, WCU
        counters.latency += latency                     //  Latency in ms
        counters.count += count                         //  Item count
        counters.scanned += scanned                     //  Items scanned
        counters.requests++                             //  Number of requests
    }

    flush(timestamp = Date.now(), tree = this.tree, dimensions = [], props = {}) {
        if (!this.enable) return
        for (let [key, rec] of Object.entries(tree)) {
            if (key == 'counters') {
                if (rec.requests) {
                    Object.keys(rec).forEach(key => rec[key] === 0 && delete rec[key])
                    let rprops = Object.assign(props, rec)
                    this.emitMetrics(timestamp, rprops, dimensions)
                    rec.requests = rec.count = rec.scanned = rec.latency = rec.read = rec.write = 0
                }
            } else {
                let dims = dimensions.slice(0)
                dims.push(key)
                for (let [name, tree] of Object.entries(rec)) {
                    let rprops = Object.assign({}, props)
                    rprops[key] = name
                    this.flush(timestamp, tree, dims, rprops)
                }
            }
        }
        if (this.test && tree == this.tree) {
            let output = this.output
            this.output = []
            return output
        }
    }

    emitMetrics(timestamp, values, dimensions = []) {
        let requests = values.requests

        values.latency = values.latency / requests
        values.count = values.count / requests
        values.scanned = values.scanned / requests

        if (this.log && this.log.emit) {
            //  Senselogs. Preferred as it can be dynamically controled.
            let chan = this.chan || 'metrics'
            this.log.metrics(chan, 'SingleTable Custom Metrics',
                this.namespace, values, [dimensions], {latency: 'Milliseconds', default: 'Count'})

        } else {
            let keys = Object.keys(values).filter(v => dimensions.indexOf(v) < 0)
            let metrics = keys.map(v => {
                return {Name: v, Unit: v == 'latency' ? 'Milliseconds' : 'Count'}
            })
            let data = Object.assign({
                _aws: {
                    Timestamp: timestamp,
                    CloudWatchMetrics: [{
                        Dimensions: [dimensions],
                        Namespace: this.namespace,
                        Metrics: metrics,
                    }]
                },
            }, values)
            if (this.test) {
                //  Capture just for testsing
                this.output.push('SingleTable Custom Metrics ' + JSON.stringify(data) + '\n')

            } else if (process.stdout) {
                process.stdout.write('SingleTable Custom Metrics ' + JSON.stringify(data) + '\n')

            } else {
                console.log('SingleTable Custom Metrics ' + JSON.stringify(data))
            }
        }
    }

    getModel(params) {
        const hash = this.indexes.primary.hash
        let model
        if (typeof this.model == 'function') {
            model = this.model(params)
        } else if (this.separator) {
            if (params.Item) {
                model = Object.values(params.Item[hash])[0].split(this.separator)[0]
            } else {
                model = '_Generic'
            }
        }
        return model
    }
}
