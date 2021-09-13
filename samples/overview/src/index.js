/*
    Metrics Overview -- in JavaScript
 */

import AWS from 'aws-sdk'
import DynamoDB from 'aws-sdk/clients/dynamodb.js'
import Metrics from 'dynamodb-metrics'

const client = new DynamoDB.DocumentClient({})

async function test() {
    const metrics = new Metrics({
        client,
        indexes: {primary: { hash: 'pk', sort: 'sk' }},
        source: 'MySample',
        separator: ':',
    })

    let items = await client.scan({
        TableName: 'sensedb',
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
