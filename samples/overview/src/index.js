/*
    Metrics Overview -- in JavaScript
 */

import DynamoDB from 'aws-sdk/clients/dynamodb.js'
import Metrics from 'dynamodb-metrics'

const TableName = 'TestTable'
const client = new DynamoDB.DocumentClient({})

async function test() {
    const metrics = new Metrics({
        client,
        dimensions: ['Table', 'Tenant', 'Source', 'Index', 'Model', 'Operation'],
        indexes: {primary: { hash: 'pk', sort: 'sk' }},
        tenant: 'Customer-42',
        source: 'OverviewSample',
        namespace: 'SingleTable/Test.1',
    })

    await client.put({
        TableName,
        Item: {
            pk: 'User#42',
            sk: 'User',
            name: 'John Doe',
        },
    }).promise()

    //  Get
    let item = await client.get({
        TableName,
        Key: {
            pk: 'User#42',
            sk: 'User',
        },
    }).promise()

    let items = await client.scan({
        TableName,
        Limit: 10,
    }).promise()

    metrics.flush()
}

async function main() {
    try {
        await test()
    } catch (err) {
        console.error(err)
    }
}

//  Ah, if only for a top-level await
main()
