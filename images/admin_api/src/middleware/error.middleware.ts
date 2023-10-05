import { NextFunction, Request, Response } from "express";
import HttpException from "../exceptions/HttpException";
import errorLogger from "../utils/logger/errorLogger";

const errorMiddleware = (error: HttpException, req: Request, res: Response, next: NextFunction) => {
	if (res.headersSent) {
		next(error);
	} else {
		const status = error.status || 500;
		let errorMessage = error.message;
		if (error.detail) {
			errorMessage = `${errorMessage} - ${error.detail}`;
		}
		const message = errorMessage || "Something went wrong";
		errorLogger(req, res, status, message);
		res.status(status).send({
			message,
			status
		});
	}
}

export default errorMiddleware;
