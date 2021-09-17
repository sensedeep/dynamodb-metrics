/*
    DynamoDB Metrics - Detailed DynamoDB Single Table metrics
*/

const DefaultConfig = {
    chan: 'metrics',
    dimensions: ['Table', 'Source', 'Index', 'Model', 'Operation'],
    enable: true,
    env: false,
    hot: false,
    indexes: {primary: {hash: 'pk', sort: 'sk'}},
    max: 100,                                                       //  Buffer metrics for 100 requests
    namespace: 'SingleTable/Metrics.1',                             //  Default custom metric namespace
    period: 30,                                                     //  or buffer for 30 seconds
    properties: null,
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
        this.counters = {}

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
        this.properties = params.properties

        this.dimensions = params.dimensions
        //  LEGACY (was object)
        if (!Array.isArray(this.dimensions)) {
            this.dimensions = Object.keys(this.dimensions)
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
        let model = this.getModel(operation, params, result)
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

        //  Counter values
        let values = {
            count: result.Count || 1,
            scanned: result.ScannedCount || 1,
            latency: timestamp - started,
            capacity,
            operation,
        }
        /*
            All possible dimensions. The this.dimensions will be the subset emitted as EMF dimensions.
            The remainder will be emited as properties in the EMF record, but not EMF dimensions.
        */
        let dimensionValues = {
            Table: tableName,
            Tenant: this.tenant,
            Source: this.source,
            Index: params.IndexName || 'primary',
            Model: model,
            Operation: operation,
        }
        let properties
        if (typeof this.properties == 'function') {
            properties = this.properties(operation, params, result)
        } else {
            properties = this.properties || {}
        }
        this.addMetricGroup(values, dimensionValues, properties)

        if (this.queries && params.profile) {
            // this.counters.Profile = this.counters.Profile || {}
            dimensionValues.Profile = params.profile
            this.addMetric('Profile', values, ['Profile'], dimensionValues, properties)
        }
        if (++this.count >= this.max || (this.lastFlushed + this.period) < timestamp) {
            this.flush(timestamp)
            this.count = 0
            this.lastFlushed = timestamp
        }
    }

    /*
        Perform an ordered aggregation of the values each level of the enabled dimensions
    */
    addMetricGroup(values, dimensionValues, properties) {
        let dimensions = [], keys = []
        for (let name of this.dimensions) {
            let dimension = dimensionValues[name]
            //  Skip the dimensions that have not been defined (Tenant, Source).
            if (dimension) {
                keys.push(dimension)
                dimensions.push(name)
                this.addMetric(keys.join('.'), values, dimensions, dimensionValues, properties)
            }
        }
    }

    /*
        Aggregate the metric values for a specific level of the dimension tree
    */
    addMetric(key, values, dimensions, dimensionValues, properties) {
        let rec = this.counters[key] = this.counters[key] || {
            totals: { count: 0, latency: 0, read: 0, requests: 0, scanned: 0, write: 0 },
            dimensions: dimensions.slice(0),
            dimensionValues,
            properties,
        }
        let totals = rec.totals
        totals[ReadWrite[values.operation]] += values.capacity    //  RCU, WCU
        totals.latency += values.latency                          //  Latency in ms
        totals.count += values.count                              //  Item count
        totals.scanned += values.scanned                          //  Items scanned
        totals.requests++                                         //  Number of requests
    }

    flush(timestamp = Date.now()) {
        if (!this.enable) return
        for (let [key, rec] of Object.entries(this.counters)) {
            Object.keys(rec).forEach(field => rec[field] === 0 && delete rec[field])
            this.emitMetrics(timestamp, rec)
        }
        this.counters = {}
        if (this.test) {
            let output = this.output
            this.output = []
            return output
        }
    }

    emitMetrics(timestamp, rec) {
        let {dimensionValues, dimensions, properties, totals} = rec

        let requests = totals.requests
        totals.latency = totals.latency / requests
        totals.count = totals.count / requests
        totals.scanned = totals.scanned / requests

        if (this.log && this.log.emit) {
            //  Senselogs. Preferred as it can be dynamically controled.
            let chan = this.chan || 'metrics'
            this.log.metrics(chan, 'SingleTable Custom Metrics',
                this.namespace, totals, dimensions, {latency: 'Milliseconds', default: 'Count'}, properties)

        } else {
            //  Dimensions is all possible dimension values. Find those that are enabled metric dimensions
            let metrics = dimensions.map(v => {return {Name: v, Unit: v == 'latency' ? 'Milliseconds' : 'Count'}})

            let data = Object.assign({
                _aws: {
                    Timestamp: timestamp,
                    CloudWatchMetrics: [{
                        Dimensions: [dimensions],
                        Namespace: this.namespace,
                        Metrics: metrics,
                    }]
                },
            }, totals, dimensionValues, properties)

            // console.log(JSON.stringify(data, null, 4))

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

    getModel(operation, params, result) {
        const hash = this.indexes.primary.hash
        let model
        if (typeof this.model == 'function') {
            model = this.model(operation, params, result)
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
