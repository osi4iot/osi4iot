/* eslint-disable @typescript-eslint/no-unused-vars */
import bodyParser from "body-parser";
import express, { Request, Response, NextFunction } from "express";
import type { Server } from "http";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import * as swaggerDocument from "./swagger.json";
import { logger, stream } from "./config/winston";
import morganOption from "./config/morgan";
import IController from "./interfaces/controller.interface";
import errorMiddleware from "./middleware/error.middleware";
import pool, { hasReadReplicas, readPool } from "./config/dbconfig";
import transporter from "./config/mailer";
import IRequestWithSwaggerDoc from "./interfaces/requestWithSwaggerDoc";
import getDomainUrl from "./utils/helpers/getDomainUrl";
import process_env from "./config/api_config";
import timescaledb_pool, { hasTimescaledbReadReplicas, timescaledb_read_pool } from "./config/timescaledb_config";
import { Pool } from "pg";

// Opt-in, default off. /db_status reports which Patroni node each pool is
// currently reaching — useful while measuring a failover, and exactly the
// kind of topology detail not to expose publicly. Turn it on for a test
// window, or wrap the route in the same authorization middleware the
// controllers use and drop the flag.
const DB_STATUS_ENABLED = process.env.DB_STATUS_ENABLED === "true";

// Paths excluded from access logging: polled frequently enough that they
// drown out real traffic. /health is hit by the Swarm healthcheck every
// 30s; /db_status is typically watched once a second during a failover
// test.
const UNLOGGED_PATHS = new Set(["/health", "/db_status"]);

/**
 * Identifies the backend a connection landed on.
 *
 * cluster_name is a plain PostgreSQL GUC that Patroni does not manage —
 * verified against Patroni 4.0.4, where the name appears only as a CLI
 * argument — so setting `cluster_name: ${PATRONI_NAME}` under the node-local
 * postgresql.parameters block in patroni.yml makes this return
 * "patroni_admin2" rather than an IP address. The COALESCE keeps the query
 * working before that change lands, falling back to the server address.
 *
 * Declared up here with the other module constants rather than at the
 * bottom of the file: a `const` at the bottom happens to work only
 * because every use is inside a method that runs after module
 * evaluation, and would break the day someone referenced it from a field
 * initializer.
 */
const NODE_IDENTITY_QUERY = `
	SELECT COALESCE(NULLIF(current_setting('cluster_name', true), ''),
	                inet_server_addr()::text)         AS node,
	       pg_is_in_recovery()                        AS in_recovery,
	       current_setting('server_version')          AS version
`;

class App {
	private app: express.Application;
	private port: number;
	private server?: Server;

	constructor(controllers: IController[]) {
		this.app = express();
		this.port = 3200;

		this.initializeMiddlewares();
		this.initializeControllers(controllers);
		this.initializeErrorHandling();
		this.dbConnect();
		this.mailerReady();
	}

	public listen(): void {
		this.server = this.app.listen(this.port, () => {
			const date = Date();
			logger.log("info", `App listening on port ${this.port} - ${date}`);
		});

		// requestTimeout measures how long the CLIENT takes to send the
		// request — headers plus body — not how long the handler takes to
		// answer. A slow query is unaffected: by the time it runs, the
		// request has long since arrived and this clock has stopped.
		//
		// Sized against bodyParser's 1000mb limit rather than against query
		// latency: a large upload over a slow link is the only thing that
		// legitimately holds a request open here, and cutting it off at 30s
		// would break exactly the case the limit was raised for.
		this.server.requestTimeout = 300000; // 5 min
		this.server.headersTimeout = 60000;

		// This is the one that bounds the RESPONSE, and the reason any of
		// this is here. A request whose promise never settles — the pg
		// uncaughtException path, where the handler never calls res.json()
		// — holds its socket forever and morgan never logs it, since it
		// logs on response finish. The browser sees a connection that is
		// never answered rather than a 500.
		//
		// 120s is far above the ~15s failover window, so a request that
		// merely waits out a Patroni promotion still succeeds; it only
		// fires on genuinely stuck sockets.
		this.server.setTimeout(120000);

		this.registerProcessHandlers();
	}

	public getServer(): express.Application {
		return this.app;
	}

	private initializeMiddlewares(): void {
		this.app.use(bodyParser.json({ limit: "1000mb" }));
		this.app.use(bodyParser.urlencoded({ limit: "1000mb", extended: true }));
		this.app.set("json spaces", 4);
		this.app.use(helmet());
		this.app.use(compression());
		this.app.use(cors());
		this.app.set("trust proxy", true);
		this.app.use(
			morgan<Request, Response>(morganOption, {
				stream,
				// req.path rather than req.url: the latter carries the query
				// string, so "/health?x=1" would slip past a strict equality
				// check. The explicit <Request, Response> type arguments are
				// what make req.path visible at all — morgan's own signature
				// is written against Node's http.IncomingMessage, which has
				// url but not the path getter Express adds on top of it.
				skip: (req) => UNLOGGED_PATHS.has(req.path),
			})
		);
	}

	private initializeErrorHandling(): void {
		this.app.use(errorMiddleware);
	}

	private initializeSwagger(): void {
		const options = {
			swaggerOptions: {
				docExpansion: "none",
			},
		};
		const platformName = `${process_env.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} Platform`;
		const platformPhrase = `${process_env.PLATFORM_PHRASE}`;
		const serverUrl = `${getDomainUrl()}/admin_api/`;
		this.app.use(
			"/swagger",
			(req: IRequestWithSwaggerDoc, res: Response, next: NextFunction) => {
				(swaggerDocument as any).info.title = platformName;
				(swaggerDocument as any).info.description = platformPhrase;
				(swaggerDocument as any).servers[0].url = serverUrl;
				req.swaggerDoc = swaggerDocument;
				next();
			},
			swaggerUi.serve,
			swaggerUi.setup(swaggerDocument, options)
		);
	}

	private dbConnect() {
		// Labels are bare names: probePool appends "connected" itself, so
		// including it here produced "... database connected connected —".
		void this.probePool(pool, "Postgres (writes, admin cluster)");
		if (hasReadReplicas) {
			void this.probePool(readPool, "Postgres (reads, admin cluster)");
		}

		void this.probePool(timescaledb_pool, "TimescaleDB (writes, metrics cluster)");
		if (hasTimescaledbReadReplicas) {
			void this.probePool(timescaledb_read_pool, "TimescaleDB (reads, metrics cluster)");
		}
	}

	private mailerReady() {
		transporter
			.verify()
			.then(() => {
				logger.log("info", "Ready for send emails");
			})
			.catch((err: Error) => {
				// Interpolated rather than passed as a third argument:
				// logger.log(level, message, ...meta) treats trailing
				// arguments as metadata unless the message carries a splat
				// placeholder, so the reason ended up as a JSON blob beside
				// the message instead of inside it.
				logger.log("error", `Mailer connection has failed: ${err.message}`);
			});
	}

	private initializeControllers(controllers: IController[]): void {
		controllers.forEach((controller) => {
			this.app.use("/", controller.router);
		});
		this.initializeSwagger();

		this.app.get("/health", (req, res) => {
			// Deliberately answers for the Node process only, never for the
			// database. Swarm has a single healthcheck and its response to a
			// failure is to restart the container; tying this to Postgres
			// would turn every ~15s failover into a simultaneous restart of
			// every admin_api replica, converting a brief database outage
			// into a full API outage.
			res.send({ success: true, message: "It is working" });
		});

		if (DB_STATUS_ENABLED) {
			this.app.get("/db_status", (req, res) => {
				void this.dbStatus(res);
			});
			logger.log("warn", "/db_status is enabled — it exposes cluster topology and is unauthenticated");
		}

		this.app.all("/*", (req, res) => {
			res.status(400).json({ errorMessage: "Invalid request" });
		});
	}

	/**
	 * Reports which node each pool is currently reaching.
	 *
	 * Each call checks one client out of each pool, so the node reported is
	 * that client's, not necessarily every client's. In steady state they
	 * all agree; during the seconds around a failover they can diverge, and
	 * that divergence is the interesting part rather than noise.
	 */
	private async dbStatus(res: Response): Promise<void> {
		const probe = async (dbPool: Pool) => {
			const { rows } = await dbPool.query(NODE_IDENTITY_QUERY);
			return {
				node: rows[0].node as string,
				role: (rows[0].in_recovery as boolean) ? "replica" : "primary",
				pool: {
					total: dbPool.totalCount,
					idle: dbPool.idleCount,
					// A waiting count that stays above zero means max is too
					// small for the load, which is the number to look at
					// before deciding whether splitting reads is worth it.
					waiting: dbPool.waitingCount,
				},
			};
		};

		try {
			res.json({
				admin_write: await probe(pool),
				admin_read: hasReadReplicas ? await probe(readPool) : "same pool as admin_write",
				metrics_write: await probe(timescaledb_pool),
				metrics_read: hasTimescaledbReadReplicas
					? await probe(timescaledb_read_pool)
					: "same pool as metrics_write",
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			res.status(503).json({ error: message });
		}
	}

	/**
	 * Probes one pool, retrying with linear backoff.
	 *
	 * Uses pool.query rather than pool.connect: query checks a client out and
	 * returns it automatically, whereas the callback form of connect hands you
	 * a `done` you must call yourself. Forgetting it — as an earlier version
	 * did — checks a client out of the pool permanently, so a `max: 20` pool
	 * silently becomes 19 for the process's whole lifetime.
	 *
	 * Fire-and-forget by design: nothing here can stop the app from listening.
	 * A database still coming up is a normal state during a deployment —
	 * Patroni has to elect a leader before HAProxy has any backend to route
	 * to — so failing at boot is worth logging loudly and nothing more. The
	 * first real request opens its own connection.
	 *
	 * The probe also reports which node HAProxy actually routed to.
	 * pg_is_in_recovery() is false on the primary and true on a replica, so
	 * this is how you verify the read pool is reaching 5001 and landing
	 * somewhere other than the leader — without it, a misconfigured read pool
	 * quietly sends every read to the primary and looks like it works.
	 */
	private async probePool(dbPool: Pool, label: string): Promise<void> {
		const maxAttempts = 5;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const { rows } = await dbPool.query(NODE_IDENTITY_QUERY);
				const { node, in_recovery, version } = rows[0];
				const role = in_recovery ? "replica" : "primary";
				logger.log(
					"info",
					`${label} connected — PostgreSQL ${version as string} on ${node as string} (${role})`
				);
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				if (attempt === maxAttempts) {
					logger.log("error", `${label} unreachable after ${maxAttempts} attempts: ${message}`);
					return;
				}

				logger.log(
					"warn",
					`${label} attempt ${attempt}/${maxAttempts} failed (${message}), retrying in ${attempt * 2}s`
				);
				await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
			}
		}
	}

	/**
	 * Stops accepting new connections, then closes the pools.
	 *
	 * Symmetrical to the trap in patroni_admin's entrypoint, and for the
	 * same reason: Docker sends SIGTERM and expects the process to wind
	 * down. Without a handler, Node exits immediately and in-flight
	 * requests are cut mid-response — the client sees a truncated
	 * connection rather than an answer.
	 *
	 * This is the ONLY method registering signal handlers. An earlier
	 * revision had two — registerShutdownHandlers and
	 * registerProcessHandlers — and listen() called both, so SIGTERM ran
	 * two independent shutdowns: each with its own `shuttingDown` flag, so
	 * the guard did nothing between them, both arming a forceExit timer,
	 * both calling server.close(), and the second calling end() on pools
	 * the first had already ended, which throws. If a second handler ever
	 * seems necessary, extend this one instead.
	 *
	 * Note there is deliberately no uncaughtException filter here. The one
	 * that downgrades pg's lost-connection errors lives in the winston
	 * format — see config/winston.ts for why a process listener cannot do
	 * that job.
	 */
	private registerProcessHandlers(): void {
		let shuttingDown = false;

		const shutdown = (signal: string): void => {
			if (shuttingDown) return;
			shuttingDown = true;
			logger.log("info", `${signal} received, shutting down`);

			// Hard ceiling. If a connection refuses to drain, exiting
			// non-zero beats hanging until Swarm's SIGKILL, which would cut
			// the pools mid-shutdown. unref() so it never keeps the event
			// loop alive on its own.
			const forceExit = setTimeout(() => {
				logger.log("warn", "Shutdown timed out, exiting anyway");
				process.exit(1);
			}, 15000);
			forceExit.unref();

			this.server?.close(() => {
				// A Set because readPool may be the very same object as pool
				// when there is no read/write split — calling end() twice on
				// one pool throws.
				const pools = new Set<Pool>([pool, readPool, timescaledb_pool, timescaledb_read_pool]);
				void Promise.allSettled([...pools].map((p) => p.end())).then(() => {
					logger.log("info", "Pools closed, exiting");
					process.exit(0);
				});
			});
		};

		process.on("SIGTERM", () => shutdown("SIGTERM"));
		process.on("SIGINT", () => shutdown("SIGINT"));
	}
}

export default App;