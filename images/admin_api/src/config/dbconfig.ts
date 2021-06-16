import { Pool, types } from 'pg';

// data parsing
types.setTypeParser(types.builtins.INT8, (value: string) => {
	return parseInt(value, 10);
});

types.setTypeParser(types.builtins.FLOAT8, (value: string) => {
	return parseFloat(value);
});

types.setTypeParser(types.builtins.NUMERIC, (value: string) => {
	return parseFloat(value);
})

const pool = new Pool({
	max: 20,
	user: process.env.POSTGRES_USER,
	host: "postgres",
	password: process.env.POSTGRES_PASSWORD,
	database: process.env.POSTGRES_DB,
	port: 5432,
	idleTimeoutMillis: 30000,
});


export default pool;