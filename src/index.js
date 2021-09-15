/*
    DynamoDB Metrics - Detailed DynamoDB Single Table metrics

    Usage:

    import Metrics from 'dynamodb-metrics'

    //  V2 Document client
    const client = new DynamoDB.DocumentClient({})

    //  V2 Raw?

    let metrics = new Metrics({client})

    //  V3?
*/

const DefaultConfig = {
    chan: 'metrics',
    source: process.env.AWS_LAMBDA_FUNCTION_NAME || 'Default',      //  Default source name
    max: 100,                                                       //  Buffer metrics for 100 requests
    period: 30,                                                     //  or buffer for 30 seconds
    namespace: 'SingleTable/Metrics.1',                             //  Default custom metric namespace
    indexes: {primary: {hash: 'pk', sort: 'sk'}},
    separator: '#',
}

const MetricCollections = ['Table', 'Source', 'Index', 'Model', 'Operation']

const ReadWrite = {
    deleteItem: 'write',
    getItem: 'read',
    putItem: 'write',
    query: 'read',
    scan: 'read',
    updateItem: 'write',
    batchGet: 'read',
    batchWrite: 'write',
    transactGet: 'read',
    transactWrite: 'write',
}

const V3Ops = {
    CreateTableCommand: 'createTable',
    DeleteTableCommand: 'deleteTable',
    DeleteItemCommand: 'deleteItem',
    GetItemCommand: 'getItem',
    PutItemCommand: 'putItem',
    QueryCommand: 'query',
    ScanCommand: 'scan',
    UpdateItemCommand: 'updateItem',
}

export default class DynamoMetrics {

    constructor(params = {}) {
        params = Object.assign(DefaultConfig, params)
        this.indexes = params.indexes || {}
        this.source = params.source
        this.max = params.max
        this.period = (params.period || 30) * 1000
        this.namespace = params.namespace
        this.separator = params.separator
        this.log = params.senselogs

        this.count = 0
        this.lastFlushed = Date.now()
        this.tree = {}

        this.test = params.test
        if (this.test) {
            this.output = []
        }
        let client = this.client = params.client
        if (client.middlewareStack) {
            //  V3
            client.middlewareStack.add((next) => async (args) => {
                let started = new Date()
                let params = args.input

                let operation = V3Ops[args.constructor.name]
                if (!operation) {
                    console.error(`Cannot determin operation for ${args.constructor.name}`, args)
                } else {
                    this.request(operation, params)
                }
                let result = await next(args)

                if (operation) {
                    this.response(operation, params, result.output, started)
                }
                return result
            }, { step: 'initialize', name: 'dynamodb-metrics' })

        } else {
            client.service.customizeRequests(req => {
                let started = new Date()
                if (req.on) {
                    req.on('complete', res => { this.response(req.operation, req.params, res.data, started) })
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
        let consumed = result.ConsumedCapacity
        if (consumed) {
            //  Batch and transaction return array
            if (Array.isArray(consumed)) {
                for (let item of consumed) {
                    if (item.TableName == this.name) {
                        capacity += item.CapacityUnits
                    }
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
        let indexName = params.IndexName || 'primary'

        this.addMetric(this.tree, values, params.TableName, this.source, indexName, model, operation)

        if (++this.count >= this.max || (this.lastFlushed + this.period) < timestamp) {
            this.flush(timestamp, this.tree)
            this.count = 0
            this.lastFlushed = timestamp
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
                // model = Object.values(params.Keys[hash])[0].split(this.separator)[0]
                model = '_Generic'
            }
        }
        return model
    }

    addMetric(metrics, values, ...keys) {
        let {operation, capacity, count, latency, scanned} = values
        let collections = MetricCollections.slice(0)
        let name = collections.shift()
        for (let key of keys) {
            //  name is: Table, Source, Index ...
            metrics = metrics[name] = metrics[name] || {}

            //  key is the actual instance values
            let item = metrics[key] = metrics[key] || {
                counters: {count: 0, latency: 0, read: 0, requests: 0, scanned: 0, write: 0}
            }
            let counters = item.counters
            counters[ReadWrite[operation]] += capacity      //  RCU, WCU
            counters.latency += latency                     //  Latency in ms
            counters.count += count                         //  Item count
            counters.scanned += scanned                     //  Items scanned
            counters.requests++                             //  Number of requests
            metrics = metrics[key]
            name = collections.shift()
        }
    }

    flush(timestamp = Date.now(), tree = this.tree, dimensions = [], props = {}) {
        for (let [key, rec] of Object.entries(tree)) {
            if (key == 'counters') {
                if (rec.requests) {
                    Object.keys(rec).forEach(key => rec[key] === 0 && delete rec[key])
                    let rprops = Object.assign(props, rec)
                    this.emitMetrics(timestamp, rprops, dimensions)
                    rec.requests = rec.count = rec.scanned = rec.latency = rec.read = rec.write = 0
                }
            } else {
                dimensions.push(key)
                for (let [name, tree] of Object.entries(rec)) {
                    let rprops = Object.assign({}, props)
                    rprops[key] = name
                    this.flush(timestamp, tree, dimensions.slice(0), rprops)
                }
            }
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
            this.log.metrics(chan, `SingleTable Custom Metrics ${dimensions} ${requests}`,
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
            if (process.stdout) {
                if (this.test) {
                    this.output.push('SingleTable Custom Metrics ' + JSON.stringify(data) + '\n')
                } else {
                    process.stdout.write('SingleTable Custom Metrics ' + JSON.stringify(data) + '\n')
                }
            } else {
                console.log('SingleTable Custom Metrics ' + JSON.stringify(data))
            }
        }
    }
}
