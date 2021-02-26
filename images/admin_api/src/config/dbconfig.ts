import { Pool } from 'pg';

const pool = new Pool ({
    max: 20,
    user: process.env.POSTGRES_USER,
    host: "postgres",
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    port: 5432,
    idleTimeoutMillis: 30000,
});

export default pool;