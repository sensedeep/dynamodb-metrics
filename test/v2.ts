/*
    v2.ts - AWS V2 SDK test
 */
import AWS from 'aws-sdk'
import DynamoDB from 'aws-sdk/clients/dynamodb'
import {Metrics, Table, print, dump, delay} from './utils/init'

jest.setTimeout(7200 * 1000)

const PORT = parseInt(process.env.DYNAMODB_PORT)

const client = new DynamoDB.DocumentClient({
    endpoint: `http://localhost:${PORT}`,
    region: 'local',
    credentials: new AWS.Credentials({
        accessKeyId: 'test',
        secretAccessKey: 'test',
    })
})

const Indexes = {
    primary: { hash: 'pk', sort: 'sk' },
    // gs1: { hash: 'gs1pk', sort: 'gs1sk' project: 'all' },
    // gs2: { hash: 'gs2pk', sort: 'gs2sk', project: 'all' }
}

//  Utility to create/delete test tables
const TableName = 'V2Table'
const table = new Table({
    name: TableName,
    indexes: Indexes,
    client,
    V2: true,
})

test('Create', async() => {
    if (!(await table.exists())) {
        await table.createTable()
        expect(await table.exists()).toBe(true)
    }
})

test('Constructor: destination, name', async() => {
    const metrics = new Metrics({
        client,
        chan: 'metrics',
        indexes: Indexes,
        max: 99,
        namespace: 'Metric/test',
        period: 15 * 1000,
        source: 'jest',
        test: true,
        separator: '#',
        model: (params) => {
            return 'User'
        }
    })

    await client.put({
        TableName,
        Item: {
            pk: 'User#42',
            sk: 'User',
            name: 'John Doe',
        }
    }).promise()

    let items = await client.scan({
        TableName,
    }).promise()

    await metrics.flush()

    expect(metrics.output.length > 1).toBe(true)
})

test('Destroy Table', async() => {
    await table.deleteTable()
})
