/*
    DynamoDB Metrics TypeScript definitions
*/

type ConstructorOptions = {
    chan?: string
    client?: {}
    indexes?: {}
    max?: number
    model?: (params: {}) => string
    namespace?: string
    period?: number
    senselogs?: {}
    separator?: string
    source?: string

    //  Internal only for test
    test?: boolean
};

export default class DynamoMetrics {
    //  private
    count: number
    lastFlushed: number
    output: []
    constructor(options?: ConstructorOptions);
    flush()
}
