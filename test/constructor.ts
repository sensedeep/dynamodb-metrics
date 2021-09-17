/*
    constructor.ts - Constructor test
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
const TableName = 'ConstructorTable'
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

test('Constructor', async() => {
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
        model: (operations, params, result) => {
            return 'User'
        }
    })

    await metrics.flush()

    expect(metrics.output.length).toBe(0)
})

test('Destroy Table', async() => {
    await table.deleteTable()
})
