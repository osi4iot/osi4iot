import { Request, Response } from "express";

class HttpException extends Error {
	public status: number;

	public message: string;

	public detail: string = undefined;

	constructor(req: Request, res: Response, status: number, message: string,) {
		super(message);
		this.status = status;
		this.message = message;
	}
}

export default HttpException;
