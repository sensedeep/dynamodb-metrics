/*
    crud.ts - Crud test
 */
import {
    Metrics, Table, Namespace, client, print, dump, delay,
    BatchWriteCommand, GetCommand, DeleteCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand
} from './utils/init'

jest.setTimeout(7200 * 1000)

const Indexes = {
    primary: { hash: 'pk', sort: 'sk' },
    // gs1: { hash: 'gs1pk', sort: 'gs1sk' },
    // gs2: { hash: 'gs2pk', sort: 'gs2sk' }
}

//  Utility to create/delete test tables
const TableName = 'CrudTable'
const table = new Table({
    name: TableName,
    indexes: Indexes,
    client,
})

test('Create', async() => {
    if (!(await table.exists())) {
        await table.createTable()
        expect(await table.exists()).toBe(true)
    }
})

test('Basic CRUD', async() => {
    const metrics = new Metrics({
        client,
        chan: 'metrics',
        indexes: Indexes,
        max: 99,
        namespace: Namespace,
        period: 15 * 1000,
        source: 'jest',
        test: true,
        separator: '#',
        model: (params) => {
            return 'User'
        }
    })

    //  Put
    await client.send(new PutCommand({
        TableName,
        Item: {
            pk: 'User#42',
            sk: 'User',
            name: 'John Doe',
        },
    }))
    let output = await metrics.flush()
    expect(output.length).toBe(5)

    //  Get
    let item: any = await client.send(new GetCommand({
        TableName,
        Key: {
            pk: 'User#42',
            sk: 'User',
        },
    }))
    expect(item.Item.name).toBe('John Doe')
    output = await metrics.flush()
    expect(output.length).toBe(5)

    //  Query
    let items: any = await client.send(new QueryCommand({
        TableName,
        KeyConditionExpression: `pk = :pk`,
        ExpressionAttributeValues: {
            ':pk': 'User#42'
        }
    }))
    expect(items.Items.length).toBe(1)
    output = await metrics.flush()
    expect(output.length).toBe(5)

    //  Scan
    items = await client.send(new ScanCommand({ TableName }))
    expect(items.Items.length).toBe(1)
    output = await metrics.flush()
    expect(output.length).toBe(5)

    //  Batch
    let result = await client.send(new BatchWriteCommand({
        RequestItems: {
            [TableName]: [{
                PutRequest: {
                    Item: {
                        pk: 'User#43',
                        sk: 'User',
                        name: 'Road Runner',
                    }
                }
            }]
        }
    }))
    // expect(items.Items.length).toBe(1)
    output = await metrics.flush()
    expect(output.length).toBe(5)
})

test('Destroy Table', async() => {
    await table.deleteTable()
})
