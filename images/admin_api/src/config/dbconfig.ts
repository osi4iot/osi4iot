import { Pool, PoolConfig, QueryResult, QueryResultRow, types } from 'pg';
import process_env from './api_config';
import { logger } from './winston';

// ── data parsing ─────────────────────────────────────────────
// setTypeParser is global to the `pg` module, not per-pool: these apply
// to every connection in this process, including the ones opened by
// timescaledb_config.ts. That file repeats them, which is harmless but
// redundant — they are not independent configurations.
types.setTypeParser(types.builtins.INT8, (value: string) => {
	return parseInt(value, 10);
});

types.setTypeParser(types.builtins.FLOAT8, (value: string) => {
	return parseFloat(value);
});

types.setTypeParser(types.builtins.NUMERIC, (value: string) => {
	return parseFloat(value);
});

// ── shared connection settings ───────────────────────────────
const baseConfig: PoolConfig = {
	user: process_env.POSTGRES_USER,
	host: process_env.POSTGRES_HOST,
	password: process_env.POSTGRES_PASSWORD,
	database: process_env.POSTGRES_DB,
	idleTimeoutMillis: 30000,
	// Without this, a connection attempt made while HAProxy has no
	// healthy backend hangs until the OS TCP timeout instead of failing
	// fast enough for the request to be retried. During a failover that
	// is the difference between a slow request and a hung one.
	connectionTimeoutMillis: 5000,
};

const writePort = parseInt(process_env.POSTGRES_PORT, 10);

// POSTGRES_READ_PORT is written by the deploy code
// (internals/secrets/admin_api.go). With UsePatroniTool it is HAProxy's
// 5001; without it, it equals POSTGRES_PORT. The `??` fallback covers
// deployments whose secret predates the variable.
const readPort = parseInt(
	process_env.POSTGRES_READ_PORT ?? process_env.POSTGRES_PORT,
	10
);

// Writes, and any read that follows a write within the same request.
// Port 5000 under Patroni -> HAProxy's admin-primary -> always the leader.
const pool = new Pool({
	...baseConfig,
	max: 20,
	port: writePort,
	// Distinct application_name per pool: this is what makes
	// pg_stat_activity able to answer "is this query arriving over the
	// read path or the write path", which is how a DAL call still using
	// the wrong pool gets found.
	application_name: 'admin_api_rw',
});

pool.on('error', (err) =>
	logger.log('error', `Postgres pool error: ${err.message}`)
);

// Reads that tolerate replication lag. Port 5001 under Patroni ->
// admin-replicas -> round-robin over every node passing /read-only.
//
// The port is the only thing that differs: both roles are reached
// through the same host (haproxy_patroni with Patroni, postgres
// without), so an equal port means there is no split at all.
//
// In that case readPool is the SAME OBJECT as pool, not a copy of it.
// That matters: two Pool instances pointing at the same server would
// open two independent sets of connections (20 + 10) against a
// max_connections the deployment sized for one. Aliasing keeps the
// budget at 20 and makes every `readQuery(...)` in the DAL a plain
// `pool.query(...)` at zero cost, so call sites never branch on topology.
const readPool: Pool =
	readPort === writePort
		? pool
		: new Pool({
				...baseConfig,
				max: 10,
				port: readPort,
				application_name: 'admin_api_ro',
		  });

// Guarded by the alias check: registering a second handler on the same
// emitter would log every failover error twice.
if (readPool !== pool) {
	readPool.on('error', (err) =>
		logger.log('error', `Postgres read pool error: ${err.message}`)
	);
}

// True when reads and writes reach different backends. Lets dbConnect
// skip probing the same pool twice, and gates the retry in readQuery.
export const hasReadReplicas = readPool !== pool;

/**
 * Errors that mean "this particular connection went away", as opposed to
 * "this query is wrong".
 *
 * 57P01 is PostgreSQL's admin_shutdown: the server sends it to every
 * connected client on its way down, which is what a clean Patroni
 * shutdown produces. "Connection terminated" is pg's own wording when
 * the socket closes with a query in flight (lib/client.js, on the
 * connection's 'end' event).
 *
 * A syntax error, a constraint violation or a permission failure is not
 * in here on purpose: retrying those would just fail twice and hide the
 * real cause behind a duplicated error.
 */
const isTransientConnectionError = (err: unknown): boolean => {
	if (!(err instanceof Error)) return false;
	const code = (err as Error & { code?: string }).code;
	return code === '57P01' || err.message.includes('Connection terminated');
};

/**
 * Runs a read query, retrying once if the connection was lost.
 *
 * Use this instead of readQuery(...) for reads that tolerate
 * replication lag — listings, dashboards, anything the frontend polls.
 * Do NOT use it for a read that follows a write in the same request:
 * that one belongs on `pool`, which always reaches the leader.
 *
 * The retry is safe only because reads are idempotent. Never build the
 * equivalent for writes — a retried INSERT whose first attempt actually
 * committed before the connection dropped creates a duplicate.
 *
 * It is skipped entirely when there is no read/write split, because then
 * readPool is `pool`: one server, and a retry would hit the same dead
 * backend the first attempt just failed against. With a split, the
 * retry's new connection comes out of a backend that still has other
 * nodes UP, so there is nothing to back off for and one immediate
 * attempt is enough.
 *
 * Note this only covers failures that arrive as a rejected promise. When
 * a client dies mid-query, pg may instead emit 'error' on the client
 * itself with no listener attached — pg-pool removes its own listener
 * while a client is checked out — which surfaces as an uncaughtException
 * and never reaches this catch. winston's handleExceptions and the
 * server's socket timeout cover that path.
 */
export const readQuery = async <R extends QueryResultRow = QueryResultRow>(
	text: string,
	values?: unknown[]
): Promise<QueryResult<R>> => {
	if (!hasReadReplicas) {
		return readPool.query<R>(text, values);
	}

	try {
		return await readPool.query<R>(text, values);
	} catch (err) {
		if (!isTransientConnectionError(err)) throw err;
		logger.log(
			'warn',
			`Read connection lost (${(err as Error).message}), retrying once on another node`
		);
		return readPool.query<R>(text, values);
	}
};

export type DbAccess = 'read' | 'write';

/**
 * Dispatches a query to the right pool.
 *
 * Saves every DAL function from repeating the ternary, and — more to the
 * point — from having to remember that the read path goes through
 * readQuery (with its retry) rather than readPool.query directly.
 *
 * 'write' is the correct default at every call site: it is always safe,
 * it just forgoes the offload. 'read' is the one that needs thinking
 * about, so it should be the one you type explicitly.
 */
export const dbQuery = async <R extends QueryResultRow = QueryResultRow>(
	access: DbAccess,
	text: string,
	values?: unknown[]
): Promise<QueryResult<R>> =>
	access === 'read' ? readQuery<R>(text, values) : pool.query<R>(text, values);

export { readPool };
export default pool;