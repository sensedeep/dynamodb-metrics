/*
    coverage.ts - tests for improved coverage
 */
import {
    Metrics, Table, Namespace, client, print, dump, delay,
    GetCommand, DeleteCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand
} from './utils/init'

// jest.setTimeout(7200 * 1000)

const Indexes = {
    primary: { hash: 'pk', sort: 'sk' },
}

//  Utility to create/delete test tables
const TableName = 'CoverageTable'
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
    let metrics = new Metrics({client})
    metrics.destroy()

    metrics = new Metrics({
        client,
        chan: 'metrics',
        indexes: Indexes,
        namespace: Namespace,
        test: true,
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

    let output = await metrics.flush()
    expect(output.length > 1).toBe(true)
})

test('Destroy Table', async() => {
    await table.deleteTable()
})
