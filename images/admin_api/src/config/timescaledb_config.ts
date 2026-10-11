import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import process_env from './api_config';
import { logger } from './winston';

// No setTypeParser calls here. They are global to the `pg` module rather
// than per-pool, so the ones in dbconfig.ts already apply to every
// connection this process opens, including these. Repeating them was
// harmless but suggested the two files configured parsing independently,
// which they never did.

// ── shared connection settings ───────────────────────────────
// max and port deliberately left out of the base: both pools override
// them, and carrying a `max: 20` here alongside the read pool's `max: 10`
// made the effective budget hard to read at a glance.
const baseTimescaledbConfig: PoolConfig = {
	user: process_env.TIMESCALE_USER,
	host: process_env.TIMESCALE_HOST,
	password: process_env.TIMESCALE_PASSWORD,
	database: process_env.TIMESCALE_DB,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 5000,
};

const writePort = parseInt(process_env.TIMESCALE_PORT, 10);

// TIMESCALE_READ_PORT is written by the deploy code
// (internals/secrets/admin_api.go). With UsePatroniTool it is HAProxy's
// 5101; without it, it equals TIMESCALE_PORT.
const readPort = parseInt(
	process_env.TIMESCALE_READ_PORT ?? process_env.TIMESCALE_PORT,
	10
);

// Port 5100 under Patroni -> HAProxy's metrics-primary -> always the leader.
const timescaledb_pool = new Pool({
	...baseTimescaledbConfig,
	max: 20,
	port: writePort,
	application_name: 'admin_api_metrics_rw',
});

timescaledb_pool.on('error', (err) =>
	logger.log('error', `TimescaleDB pool error: ${err.message}`)
);

// Port 5101 -> metrics-replicas. See dbconfig.ts for why this aliases
// rather than duplicates when there is no split.
const timescaledb_read_pool: Pool =
	readPort === writePort
		? timescaledb_pool
		: new Pool({
				...baseTimescaledbConfig,
				max: 10,
				port: readPort,
				application_name: 'admin_api_metrics_ro',
		  });

if (timescaledb_read_pool !== timescaledb_pool) {
	// Was "Postgres read pool error", the exact wording dbconfig.ts uses
	// for the admin cluster. With both files emitting the same string, a
	// metrics failure and an admin failure were indistinguishable in the
	// log — and it was precisely that wording that revealed reads were
	// still going through the write pool.
	timescaledb_read_pool.on('error', (err) =>
		logger.log('error', `TimescaleDB read pool error: ${err.message}`)
	);
}

export const hasTimescaledbReadReplicas = timescaledb_read_pool !== timescaledb_pool;

const isTransientConnectionError = (err: unknown): boolean => {
	if (!(err instanceof Error)) return false;
	const code = (err as Error & { code?: string }).code;
	return code === '57P01' || err.message.includes('Connection terminated');
};

/**
 * Runs a read query against the metrics cluster, retrying once if the
 * connection was lost. See dbconfig.ts's readQuery for the full
 * reasoning; the mechanics are identical.
 *
 * This is the one that matters most in practice. Grafana dashboards and
 * the frontend's telemetry views are the heaviest read load on the
 * platform, they are pure reads, and a dashboard showing data a couple
 * of hundred milliseconds stale is indistinguishable from a fresh one —
 * which is the definition of lag-tolerant.
 */
export const timescaledbReadQuery = async <R extends QueryResultRow = QueryResultRow>(
	text: string,
	values?: unknown[]
): Promise<QueryResult<R>> => {
	if (!hasTimescaledbReadReplicas) {
		return timescaledb_read_pool.query<R>(text, values);
	}

	try {
		return await timescaledb_read_pool.query<R>(text, values);
	} catch (err) {
		if (!isTransientConnectionError(err)) throw err;
		logger.log(
			'warn',
			`Metrics read connection lost (${(err as Error).message}), retrying once on another node`
		);
		return timescaledb_read_pool.query<R>(text, values);
	}
};

export default timescaledb_pool;
export { timescaledb_read_pool };