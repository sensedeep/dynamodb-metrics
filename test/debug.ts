/*
    debug.ts - Debug test
 */
import {
    Metrics, Table, Namespace, client, print, dump, delay,
    GetCommand, DeleteCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand
} from './utils/init'

jest.setTimeout(7200 * 1000)

const Indexes = {
    primary: { hash: 'pk', sort: 'sk' },
    // gs1: { hash: 'gs1pk', sort: 'gs1sk' project: 'all' },
    // gs2: { hash: 'gs2pk', sort: 'gs2sk', project: 'all' }
}

//  Utility to create/delete test tables
const TableName = 'DebugTable'
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

test('Debug', async() => {
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

    await client.send(new PutCommand({
        TableName,
        Item: {
            pk: 'User#42',
            sk: 'User',
            name: 'John Doe',
        },
    }))

    let items = await client.send(new ScanCommand({ TableName }))

    await metrics.flush()

    expect(metrics.output.length > 1).toBe(true)
})

test('Destroy Table', async() => {
    await table.deleteTable()
})
