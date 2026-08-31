import morgan from "morgan";
import type { Request, Response } from "express";

export const morganFormat = (tokens: morgan.TokenIndexer, req: Request, res: Response): string => {
	const status = Number(tokens.status?.(req, res) ?? 0);

	// 5xx is the server failing; 4xx is the API doing its job. A 401 from
	// an expired token and a 404 for a deleted asset are normal traffic on
	// a REST API, and logging them at "error" buries the events that
	// actually need attention — a failover-induced 500 arrives in the same
	// bucket as every stale JWT. "warn" keeps them visible without making
	// level=error meaningless as an alerting signal.
	const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

	return JSON.stringify({
		level,
		message: `${tokens.method?.(req, res)} ${tokens.url?.(req, res)} ${status}`,
		remote_addr: tokens["remote-addr"]?.(req, res),
		method: tokens.method?.(req, res),
		url: tokens.url?.(req, res),
		status,
		content_length: tokens.res?.(req, res, "content-length"),
		response_time_ms: Number(tokens["response-time"]?.(req, res)),
	});
};

export const morganSimple =
	':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] bytes :response-time ms';

export default morganFormat;