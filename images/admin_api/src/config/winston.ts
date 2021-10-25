import { createLogger, format, transports } from "winston";
import process_env from "./api_config";

const { combine } = format;

// define the custom settings for each transport (file, console)
const options = {
	combined: {
		level: "info",
		filename: "./logs/combined.log",
		handleExceptions: true,
		format: combine(format.splat(), format.simple()),
		maxsize: 5242880, // 5MB
		maxFiles: 5,
		colorize: false
	},
	error: {
		level: "error",
		filename: "./logs/error.log",
		handleExceptions: true,
		format: combine(format.splat(), format.simple()),
		maxsize: 5242880, // 5MB
		maxFiles: 5,
		colorize: false
	},
	console: {
		level: "info",
		format: combine(format.colorize(), format.splat(), format.simple()),
		handleExceptions: true,
		colorize: true
	}
};

// instantiate a new Winston Logger with the settings defined above
export const logger = createLogger({
	transports: [new transports.File(options.error), new transports.File(options.combined)],
	exitOnError: false // do not exit on handled exceptions
});

if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production") {
	logger.add(new transports.Console(options.console));
}

export const stream = {
	write: (message: string): void => {
		logger.log({
			level: "info",
			message
		});
	}
};
