import _ from 'lodash';

import {Iter} from '@j-cake/jcake-utils/iter';

import DB, {parsers} from './index.js';

export namespace DBObjects {
    export const typeIndicator = Symbol('EDB_TYPE_INDICATOR');

    export interface Table {
        [typeIndicator]: 'table',
        name: string,
        columns: Record<string, parsers.DBType>,
        data: string
    }

    export interface Sequence {
        [typeIndicator]: 'sequence',
        name: string,
        currentValue: bigint,
    }

    export interface Relation {
        [typeIndicator]: 'relation',
        table1: string,
        column1: string,

        table2: string,
        column2: string
    }

    export interface User {
        name: string
    }
}

namespace utilTypes {
    export type GetObjectsOfType<A extends DBObject, Type extends DBObject[typeof DBObjects.typeIndicator]> = A extends any ? A[typeof DBObjects.typeIndicator] extends Type ? A : never : never;
    export type ObjectAndType<Type extends DBObject[typeof DBObjects.typeIndicator]> = {
        type: Type,
        object: GetObjectsOfType<DBObject, Type>
    };
}

export type DBObject = DBObjects.Table | DBObjects.Relation | DBObjects.Sequence;

export interface StructuredSchema {
    meta: {
        name: string,
        users: DBObjects.User[],
        objects: DBObject[],
    },

    data: Record<string, Buffer>
}

export type JoinType = 'inner' | 'outer' | 'left' | 'right' | 'left outer' | 'right outer' | 'natural' | 'cross';

export type Table<Database extends StructuredSchema> = string | DBObjects.Table | Select<Database, any>;

export class Select<Database extends StructuredSchema, Row extends Record<string, any>> implements AsyncIterable<Row> {
    private db: Omit<StructuredQueryDatabase<Database>, 'backing'> & { backing: DB<Database> };

    *join(table: Table<Database>, origin: string, dest: string, options?: Partial<{
        alias: string,
        type: JoinType
    }>): Select<Database, Row & Record<string, any>> {

    }

    *group(columns: string[], aggregates: ((values: AsyncIterable<any>) => any)[]): Select<Database, Row> {

    }

    *filter(predicate: (row: Record<string, any>) => boolean): Select<Database, Row> {

    }

    *union(table: Table<Database>): Select<Database, Row> {

    }

    *intersection(table: Table<Database>): Select<Database, Row> {

    }

    *values(valueSource: AsyncIterable<Record<string, any>>): Select<Database, Record<string, any>> {

    }

    *sort(columns: string[]): Select<Database, Row> {

    }

    async print(): Promise<void> {

    }

    async collect<Row extends Record<string, any>>(): Promise<Row[]> {
        return []
    }

    [Symbol.asyncIterator]() {
        if (typeof this.table == 'string')
            if (this.options?.vtables && this.table in this.options?.vtables)
                return this.options?.vtables[this.table][Symbol.asyncIterator]();
            else
                return this.parseCSV(this.table);
    }

    constructor(private table: Table<Database>, private columns?: string[] | 'all', private options: Partial<{
        distinct: boolean,
        limit: number,
        alias: string,
        vtables: Record<string, Table<Database>>
    }> & { db: StructuredQueryDatabase<Database> }) {
        this.db = options.db as any;
    }

    private async *parseCSV(tableName: string): AsyncGenerator<Row, {rowCount: number, chunks: number}> {
        const table = await this.db.backing.getAll<Database['meta']['objects']>(['meta', 'objects'])
            .then(res => Object.values(res).map(i => ({ ...i, [DBObjects.typeIndicator]: i['@@typeIndicator'] })))
            .then(res => res.find(i => this.db.isTable(i) && i.name == tableName) as DBObjects.Table);
            
        if (!this.columns || this.columns == 'all')
            this.columns = table.columns;
        
        let rowCount: number = 0;
        let chunks: number = 0;
        let buffer: Buffer = Buffer.alloc(0);
        for await (const chunk of Iter(this.db.backing.getRaw(['data', table.data], { maxChunkSize: 1024 ** 2 }))
            .concat([Buffer.from('\n')])) {
                
            let buf = Buffer.concat([buffer, chunk.slice(chunks++ <= 1 ? 4 : 0)]);
            
            const lines: Buffer[] = [];
            
            let index = buf.indexOf('\n');
            while (index > -1) {
                lines.push(buf.slice(0, index));
                buf = buf.slice(index + 1);
                index = buf.indexOf('\n');
            }
            
            buffer = buf;
            
            for (const i of lines)
                if (i.length > 0) {
                    const record = i.toString('utf8').split(',');
                    
                    yield _.chain(this.columns)
                        .map((i, a) => [i, Buffer.from(record[a] ?? '', 'base64').toString('utf8')])
                        .fromPairs()
                        .value();
                        
                    rowCount++;
                }
        }
        
        return { rowCount, chunks };
    }
}

export class Transaction<Database extends StructuredSchema> {
    select(table: Table<Database>, columns?: string[] | 'all', options?: Partial<{
        distinct: boolean,
        limit: number,
        alias: string
    }>) {
        return new Select(table, columns, {
            ...options,
            db: this.db
        });
    }

    cancelTransaction() {}

    constructor(private db: StructuredQueryDatabase<Database>) {}
}

export default class StructuredQueryDatabase<Schema extends StructuredSchema> {
    constructor(private backing: DB<Schema>) {
    }

    public transaction(): Transaction<Schema> {
        return new Transaction(this);
    }

    isTable(i: any): i is DBObjects.Table {
        return typeof i == 'object' && i[DBObjects.typeIndicator] == 'table';
    }

    static blank<Schema extends StructuredSchema>(name: string): StructuredQueryDatabase<Schema> {
        const db = new DB<Schema>(new Map());

        return new StructuredQueryDatabase(db);
    }
}