declare module 'better-sqlite3' {
	namespace Database {
		interface Statement {
			run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
			get(...params: any[]): any;
			all(...params: any[]): any[];
		}
		interface Database {
			prepare(sql: string): Statement;
			exec(sql: string): any;
			close(): void;
		}
	}
	interface DatabaseConstructor {
		new (filename: string, options?: any): Database.Database;
		(filename: string, options?: any): Database.Database;
	}
	const Database: DatabaseConstructor;
	export = Database;
}
