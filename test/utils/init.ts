import AWS from 'aws-sdk'
import Metrics from '../../src/index'
import Table from './table'

import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
    BatchWriteCommand,
    GetCommand,
    DeleteCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    UpdateCommand
} from '@aws-sdk/lib-dynamodb'

const Namespace = 'Metrics/test'

const PORT = parseInt(process.env.DYNAMODB_PORT)

const low = new DynamoDBClient({
    endpoint: `http://localhost:${PORT}`,
    region: 'local',
    credentials: new AWS.Credentials({
        accessKeyId: 'test',
        secretAccessKey: 'test',
    })
})
const client = DynamoDBDocumentClient.from(low)

const dump = (...args) => {
    let s = []
    for (let item of args) {
        s.push(JSON.stringify(item, function (key, value) {
            if (this[key] instanceof Date) {
                return this[key].toLocaleString()
            }
            return value
        }, 4))
    }
    console.log(s.join(' '))
}

const print = (...args) => {
    console.log(...args)
}

const delay = async (time) => {
    return new Promise(function(resolve, reject) {
        setTimeout(() => resolve(true), time)
    })
}

export {Metrics, Table, Namespace, client, delay, dump, print}
export {CreateTableCommand, DeleteCommand, DeleteTableCommand, BatchWriteCommand, 
        GetCommand, ListTablesCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand}
