/*
    v2.ts - AWS V2 SDK test
 */
import AWS from 'aws-sdk'
import DynamoDB from 'aws-sdk/clients/dynamodb'
import {Metrics, Table, print, dump, delay} from './utils/init'

// jest.setTimeout(7200 * 1000)

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

test('V2 CRUD', async() => {
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
    let output = await metrics.flush()
    expect(output.length).toBe(5)

    let item = await client.get({
        TableName,
        Key: {
            pk: 'User#42',
            sk: 'User',
        }
    }).promise()
    expect(item.Item.name).toBe('John Doe')
    output = await metrics.flush()
    expect(output.length).toBe(5)

    let items = await client.query({
        TableName,
        KeyConditionExpression: `pk = :pk`,
        ExpressionAttributeValues: {
            ':pk': 'User#42'
        }
    }).promise()
    expect(items.Items.length).toBe(1)
    output = await metrics.flush()
    expect(output.length).toBe(5)

    items = await client.scan({ TableName }).promise()
    expect(items.Items.length).toBe(1)
    output = await metrics.flush()
    expect(output.length).toBe(5)
})

test('Destroy Table', async() => {
    await table.deleteTable()
})
