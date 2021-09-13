![DynamoDB Metrics](https://www.sensedeep.com/images/metrics-logo.png)

## Understand how your DynamoDB Single Table designs are performing!

[![Build Status](https://img.shields.io/github/workflow/status/sensedeep/dynamodb-metrics/build)](https://img.shields.io/github/workflow/status/sensedeep/dynamodb-metrics/build)
[![npm](https://img.shields.io/npm/v/dynamodb-metrics.svg)](https://www.npmjs.com/package/dynamodb-metrics)
[![npm](https://img.shields.io/npm/l/dynamodb-metrics.svg)](https://www.npmjs.com/package/dynamodb-metrics)
[![Coverage Status](https://coveralls.io/repos/github/sensedeep/dynamodb-metrics/badge.svg?branch=main)](https://coveralls.io/github/sensedeep/dynamodb-metrics?branch=main)


DynamoDB Metrics calculates detailed DynamoDB metrics for single table design patterns.

The standard DynamoDB metrics provide basic table and index level metrics. However, when using single-table design patterns, a more detailed set of performance metrics are required.

If you've wondered:

* Which app, function is causing the most load and consuming the most RCU/WCU.
* Which single-table entity/model is most loaded and consuming RCU/WCU.
* Which queries are the most inefficient (items vs scanned).
* Who is doing scans (app, function, model).

DynamoDB metrics was created for those who have existing code bases using DynamoDB and single-table design patterns and for whom using
[OneTable](https://github.com/sensedeep/dynamodb-onetable) would require a significant rewrite. It emits metrics that are compatible with those emited by OneTable.

## DynamoDB Metrics Features

* Creates detailed CloudWatch metrics for Tables, Indexes, Apps/Functions, Entities and DynamoDB operations
* Emits metrics using [CloudWatch EMF](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html) for zero-latency metric creation.
* Supports AWS V2 and V3 SDKs.
* Easy few line integration.
* Very low CPU and memory impact.
* Supported by the free [SenseDeep Developer Plan](https://www.sensedeep.com/) for graphical DynamoDB single-table monitoring.
* No dependencies.
* Optionally integrates with [SenseLogs](https://www.npmjs.com/settings/sensedeep/packages) for dynamic control of metrics.
* Clean, readable small code base (<300 lines).
* Full TypeScript support.

## Quick Tour

Install the library using npm or yarn.

    npm i dynamodb-metrics

Import the DynamoDB Metrics library. If you are not using ES modules or TypeScript, use `require` to import the library.

```javascript
import Metrics from 'dynamodb-metrics'
```

Then create your `Metrics` instance and pass your DynamoDB client as a parameter.

```javascript
const metrics = new Metrics({
    client: client,
    indexes: {primary: {hash: 'pk', sort: 'sk'}},
    separator: '#',
})
```

The `client` should be a DynamoDB client instance. The `indexes` parameter describes the names of your primary and secondary keys. Metrics uses this key description to decode your single-table items.

Read [Single Table Configuration](#single-table-configuration) below for options on how to tell Metrics about your key design.

Metrics will flush metrics by default every 30 seconds or after 100 requests, but you can tailor these defaults via constructor parameters. You can also force out the metrics via `metrics.flush` at any time.

```javascript
metrics.flush()
```


## Initializing the AWS SDK V2, V3 with/without DocumentClient

If using the AWS V2 SDK with the DocumentClient, create your DynamoDB client.

```javascript
import DynamoDB from 'aws-sdk/clients/dynamodb'
client: new DynamoDB.DocumentClient({})

or if using the AWS V2 SDK with the low level API

const client = new DynamoDB({})
```

If using the AWS V3 SDK, first create the low level client and then create the V3 DocumentClient instance.

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const low = new DynamoDBClient({})
const client = DynamoDBDocumentClient.from(low)
```

## Metrics

DynamoDB Metrics creates the following metrics

* read &mdash; Read capacity units consumed
* write &mdash; Write capacity units consumed
* latency &mdash; Aggregated request latency in milliseconds
* count &mdash; Count of items returned
* scanned &mdash; Number of items scanned
* requests &mdash; Number of API requests issued

DynamoDB Metrics will create these metrics for the following dimensions:

* Table
* Source
* Index
* Model
* Operation

The Table dimension is set to the table Name.

The Source dimension is defined via the `Metric` constructor `source` parameter. You can set this to any identifying string you like. It is typically set to your application or function name. If unset, it will default to the name of the executing Lambda function.

The Index dimension is set to `primary` for the primary index and to the name of a Global Secondary Index (GSI) is that is being used.

The Model is the single-table entity name. Read [DynamoDB Single Table Design](https://www.sensedeep.com/blog/posts/2021/dynamodb-singletable-design.html) for background on single table design patterns. The model name is determined based on the keys used or returned in the request. See below for Single Table Configuration.

The operation dimension is set to the DynamoDB operation: getItem, putItem etc.

## Single Table Configuration

DynamoDB Metrics needs to determine the single-table model/entity for each request so that it can attribute the request to the appropriate entity. And so, Metrics needs to be able to interpret your key attributes in requests and responses. To do this, when constructing the `Metrics` instance you describe your indexes and the hash/sort key separator you are using.

## Model via Separators

If you construct your hash/sort keys with unique prefixes for your single-table entity models, then the separator approach is ideal. Simply set the separator property in the Metric constructor. By default this is set to '#'.

For example, if your hash key format was `MODEL_NAME:ID` then you would set the separator to ':'.

```javascript
const metrics = new Metrics({
    indexes,
    separator: ':'
})
```

## Model via Callback

If you are using a more complex scheme to encode your single-table entities, then set the `model` callback so you can determine the model name yourself. For example:

```javascript
const metrics = new Metrics({
    indexes,
    model(params, result) => {
        //  Custom logic to return the model name. For example:
        return Object.values(params.Item[hash])[0].split('#')[0]
    }
})
```

### SenseDeep

[SenseDeep](https://www.sensedeep.com/) offers a free subscription for developers that monitors and graphs the DynamoDB metrics.

Here is a screen shot:

![SenseDeep Single Table Monitoring](https://www.sensedeep.com/images/sensedeep/table-single.png)


### Metrics Class API

The Metrics class provides the public API.

### Constructor

```javascript
new Metrics(options)
```

The Metrics constructor takes an options map parameter with the following properties.

| Property | Type | Description |
| -------- | :--: | ----------- |
| chan | `string` | If using SenseLogs, this will define the SenseLogs channel to use for the output.|
| indexes | `map` | Map of indexes supported by the table. The map keys are the names of the indexes. The values are a map of 'hash' and 'sort' attribute names. Must always contain a `primary` element.|
| max | `number` | Maximum number of metric events to buffer before flushing to stdout and on to CloudWatch EMF. Defaults to 100.|
| period | `number` | Number of seconds to buffer metric events before flushing to stdout. Defaults to 30 seconds.|
| namespace | `string` | Namespace to use for the emitted metrics. Defaults to `SingleTable/Metrics.1`.|
| separator | `string` | Separator used between entity/model names in the hash and sort keys. Defaults to '#'.|
| senselogs | `instance` | SenseLogs instance to use to emit the metrics. This permits dynamic control of metrics.|
| model | `function` | Set to a function to be invoked to determine the entity model name. Invoked as: `model(params, result)`|
| source | `string` | Set to an identifying string for the application or function calling DynamoDB. Defaults to the Lambda function name.|

For example:

```javascript
const metrics = new Metrics({
    client,
    chan: 'metrics',
    indexes: {
        primary: { hash: 'pk', sort: 'sk' },
        gs1: { hash: 'gs1pk', sort: 'gs1sk' },
        gs2: { hash: 'gs2pk', sort: 'gs2sk' }
    },
    max: 99,
    namespace: 'Acme/Launches',
    period: 15 * 1000,
    source: 'BigRocket',
    separator: '#',
    model: (params, result) => {
        return Object.values(params.Item[hash])[0].split('#')[0]
    }
})
```

### Methods

#### flush()

Flush any buffered metrics to stdout.


### References

- [DynamoDB Metrics Sample](https://github.com/sensedeep/dynamodb-metrics/tree/main/samples/overview)
- [SenseDeep Blog](https://www.sensedeep.com/blog/)
- [SenseDeep Web Site](https://www.sensedeep.com/)
- [SenseDeep Developer Studio](https://app.sensedeep.com/)

### Participate

All feedback, discussion, contributions and bug reports are very welcome.

* [discussions](https://github.com/sensedeep/dynamodb-metrics/discussions)
* [issues](https://github.com/sensedeep/dynamodb-metrics/issues)

### Contact

You can contact me (Michael O'Brien) on Twitter at: [@mobstream](https://twitter.com/mobstream), or [email](mob-pub-18@sensedeep.com) and ready my [Blog](https://www.sensedeep.com/blog).

### SenseDeep

Please try best way to monitor DynamoDB is via the Serverless Developer Studio [SenseDeep](https://www.sensedeep.com/).
