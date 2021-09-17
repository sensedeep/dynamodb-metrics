/*
    DynamoDB Metrics TypeScript definitions
*/

type ConstructorOptions = {
    chan?: string
    client?: {}
    dimensions?: string[]
    enable?: boolean
    indexes?: {}
    max?: number
    model?: (operations: string, params: {}, result: {}) => string
    namespace?: string
    period?: number
    properties?: ((operations: string, params: {}, result: {}) => string) | {}
    queries?: boolean
    separator?: string
    senselogs?: {}
    source?: string
    tenant?: string
    //  Internal only for test
    test?: boolean
};

export default class DynamoMetrics {
    //  private
    count: number
    lastFlushed: number
    output: []
    constructor(options?: ConstructorOptions);
    destroy()
    flush()
}
