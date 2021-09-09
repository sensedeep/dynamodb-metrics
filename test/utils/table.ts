import { CreateTableCommand, DeleteTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb'
import {delay} from './init'

export default class Table {
    name
    indexes
    client
    V2
    constructor(params: any) {
        this.name = params.name
        this.indexes = params.indexes
        this.client = params.client
        this.V2 = params.V2 || false
    }

    async createTable(params: any = {}) {
        this.name = this.name
        let def: any = {
            AttributeDefinitions: [],
            KeySchema: [],
            LocalSecondaryIndexes: [],
            GlobalSecondaryIndexes: [],
            TableName: this.name,
        }
        let provisioned = params.ProvisionedThroughput
        if (provisioned) {
            def.ProvisionedThroughput = provisioned
            def.BillingMode = 'PROVISIONED'
        } else {
            def.BillingMode = 'PAY_PER_REQUEST'
        }
        let attributes = {}
        let indexes = this.indexes || {}

        let name: string, index: any
        for ([name, index] of Object.entries(indexes)) {
            let collection, keys
            if (name == 'primary') {
                keys = def.KeySchema
            } else {
                if (index.hash == null || index.hash == indexes.primary.hash) {
                    collection = 'LocalSecondaryIndexes'
                    if (index.project) {
                        throw new Error('Unwanted project for LSI')
                    }
                } else {
                    collection = 'GlobalSecondaryIndexes'
                }
                keys = []
                let project, attributes
                if (Array.isArray(index.project)) {
                    project = 'INCLUDE'
                    attributes = index.project
                } else if (index.project == 'keys') {
                    project = 'KEYS_ONLY'
                } else {
                    project = 'ALL'
                }
                let projDef: any = {
                    IndexName: name,
                    KeySchema: keys,
                    Projection: {
                        ProjectionType: project,
                    }
                }
                if (attributes) {
                    projDef.Projection.NonKeyAttributes = attributes
                }
                def[collection].push(projDef)
            }
            keys.push({
                AttributeName: index.hash || indexes.primary.hash,
                KeyType: 'HASH',
            })
            if (index.hash && !attributes[index.hash]) {
                def.AttributeDefinitions.push({
                    AttributeName: index.hash,
                    AttributeType: 'S',
                })
                attributes[index.hash] = true
            }
            if (index.sort) {
                if (!attributes[index.sort]) {
                    def.AttributeDefinitions.push({
                        AttributeName: index.sort,
                        AttributeType: 'S',
                    })
                    attributes[index.sort] = true
                }
                keys.push({
                    AttributeName: index.sort,
                    KeyType: 'RANGE',
                })
            }
        }
        if (def.GlobalSecondaryIndexes.length == 0) {
            delete def.GlobalSecondaryIndexes
        } else if (provisioned) {
            for (let index of def.GlobalSecondaryIndexes) {
                index.ProvisionedThroughput = provisioned
            }
        }
        if (def.LocalSecondaryIndexes.length == 0) {
            delete def.LocalSecondaryIndexes
        }
        let service = this.client.service
        if (this.V2) {
            await service.createTable(def).promise()
        } else {
            await this.client.send(new CreateTableCommand(def))
        }
    }

    /*
        Delete the DynamoDB table forever. Be careful.
    */
    async deleteTable() {
        let service = this.client.service
        if (this.V2) {
            await service.deleteTable({TableName: this.name}).promise()
        } else {
            await this.client.send(new DeleteTableCommand({TableName: this.name}))
        }
    }

    async exists() {
        let results = await this.listTables()
        return results && results.find(t => t == this.name) != null ? true : false
    }

    /*
        Return a list of tables in the AWS region described by the Table instance
    */
    async listTables() {
        let results
        if (this.V2) {
            results = await this.client.service.listTables({}).promise()
        } else {
            results = await this.client.send(new ListTablesCommand({}))
        }
        return results.TableNames
    }
}
