import { createLogger, format, transports } from "winston";
const { combine, timestamp, errors } = format;

// const replicaId = process.env.REPLICA ?? "unknown";
const isDev = process.env.NODE_ENV === "development";

const jsonFormat = combine(timestamp(), errors({ stack: true }), format.splat(), format.json());

const consoleFormat = combine(
	timestamp(),
	format.colorize(),
	format.splat(),
	format.printf(({ level, message, timestamp: ts, ...meta }) => {
		const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
		return `${String(ts)} [${level}]: ${String(message)}${metaStr}`;
	})
);
// const fileOptions = {
//   combined: {
//     level: "info",
//     filename: `./logs/replica_${replicaId}/combined.log`,
//     handleExceptions: true,
//     handleRejections: true,
//     format: jsonFormat,
//     maxsize: 5242880,
//     maxFiles: 5,
//   },
//   error: {
//     level: "error",
//     filename: `./logs/replica_${replicaId}/error.log`,
//     handleExceptions: true,
//     handleRejections: true,
//     format: jsonFormat,
//     maxsize: 5242880,
//     maxFiles: 5,
//   },
// };

export const logger = createLogger({
	transports: [
		// new transports.File(fileOptions.error),
		// new transports.File(fileOptions.combined),
	],
	exitOnError: false,
});

if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production") {
	logger.add(
		new transports.Console({
			level: isDev ? "debug" : "info",
			format: isDev ? consoleFormat : jsonFormat,
			handleExceptions: true,
			handleRejections: true,
		})
	);

	logger.transports.forEach((transport) => {
		transport.on("error", (err) => {
			console.error(`Error in transport ${transport.constructor.name}:`, err);
		});
	});
}

export const stream = {
	write: (message: string): void => {
		logger.info(message.trimEnd());
	},
};
