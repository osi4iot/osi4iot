import { createLogger, format, transports } from "winston";
const { combine, timestamp, errors } = format;

// const replicaId = process.env.REPLICA ?? "unknown";
const isDev = process.env.NODE_ENV === "development";

// Downgrades pg's lost-connection exceptions from "error" to "warn".
//
// pg emits 'error' on a client that was checked out when the server
// closed the connection, because pg-pool removes its own idle listener
// for the duration of a checkout. With no listener left, Node turns it
// into an uncaughtException. The awaited query is ALSO rejected, so
// readQuery already caught it and retried on another node — the request
// succeeded, and this event is a parallel notification with nowhere to
// go rather than an application fault.
//
// A process.on("uncaughtException") listener cannot do this: winston
// installs its own handler when this module is imported, long before
// app.ts runs, and Node calls listeners in registration order — so the
// line is already logged at "error" before any filter gets a turn.
const downgradeLostConnections = format((info) => {
	const msg = String(info.message);
	if (
		msg.includes("terminating connection due to administrator command") ||
		msg.includes("Connection terminated")
	) {
		return { ...info, level: "warn" };
	}
	return info;
});

const jsonFormat = combine(
	downgradeLostConnections(),
	timestamp(),
	errors({ stack: true }),
	format.splat(),
	format.json()
);

const consoleFormat = combine(
	downgradeLostConnections(),
	timestamp(),
	format.colorize(),
	format.splat(),
	format.printf(({ level, message, timestamp: ts, ...meta }) => {
		const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
		return `${String(ts)} [${level}]: ${String(message)}${metaStr}`;
	})
);

// The Console transport is registered unconditionally, at construction
// time. It used to be added inside an `if (NODE_ENV === "development" ||
// NODE_ENV === "production")` block, which meant any other value — unset,
// "prod", "test", "staging" — left the logger with an EMPTY transports
// array. Two things were lost together, silently:
//
//   - every log line, since winston with no transport discards output;
//   - handleExceptions, which is what keeps an uncaught exception from
//     killing the process. exitOnError: false only governs exceptions
//     winston actually handles, and with no transport it handles none.
//
// So a deployment that merely misspelled NODE_ENV went both blind and
// fragile. NODE_ENV now selects the FORMAT only, never whether logging
// exists at all: a misconfigured deployment should be loud, not mute.
export const logger = createLogger({
	exitOnError: false,
	transports: [
		new transports.Console({
			level: isDev ? "debug" : "info",
			format: isDev ? consoleFormat : jsonFormat,
			// handleExceptions catches the client-level 'error' events pg
			// emits when the server closes a connection that was checked
			// out mid-query. pg-pool removes its own error listener from a
			// client while it is lent out (_acquireClient calls
			// client.removeListener('error', idleListener)), so those
			// errors bypass pool.on('error') entirely and surface here.
			handleExceptions: true,
			handleRejections: true,
		}),
	],
});

logger.transports.forEach((transport) => {
	transport.on("error", (err) => {
		console.error(`Error in transport ${transport.constructor.name}:`, err);
	});
});

/**
 * Stream adapter for morgan.
 *
 * morganFormat already emits a JSON object that includes the level it
 * derived from the status code. The previous version called
 * logger.info() on that whole string regardless, which had two effects:
 * the outer record was always level "info" — so a 500 could never be
 * matched by an alert on level=error, the one event most worth alerting
 * on — and the payload was double-encoded, ending up as a JSON string
 * nested inside the "message" field of another JSON object.
 *
 * Parsing it back out and dispatching at its own level fixes both: the
 * record carries the right level and its fields land as real metadata.
 * The catch falls back to logging the raw line, which covers
 * morganSimple (plain text, not JSON) and any malformed input.
 */
export const stream = {
	write: (message: string): void => {
		const line = message.trimEnd();
		if (!line) return;

		try {
			const parsed: unknown = JSON.parse(line);
			if (parsed && typeof parsed === "object") {
				const { level, message: msg, ...meta } = parsed as Record<string, unknown>;
				logger.log(
					typeof level === "string" ? level : "info",
					typeof msg === "string" ? msg : line,
					meta
				);
				return;
			}
		} catch {
			// not JSON — fall through
		}

		logger.info(line);
	},
};