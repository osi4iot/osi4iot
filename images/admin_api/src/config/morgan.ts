import morgan from "morgan";
import type { Request, Response } from "express";

export const morganFormat = (tokens: morgan.TokenIndexer, req: Request, res: Response): string => {
	return JSON.stringify({
		level: Number(tokens.status?.(req, res) ?? 0) >= 400 ? "error" : "info",
		message: `${tokens.method?.(req, res)} ${tokens.url?.(req, res)} ${tokens.status?.(req, res)}`,
		remote_addr: tokens["remote-addr"]?.(req, res),
		method: tokens.method?.(req, res),
		url: tokens.url?.(req, res),
		status: Number(tokens.status?.(req, res)),
		content_length: tokens.res?.(req, res, "content-length"),
		response_time_ms: Number(tokens["response-time"]?.(req, res)),
	});
};

export const morganSimple =
	':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] bytes :response-time ms';

export default morganFormat;
