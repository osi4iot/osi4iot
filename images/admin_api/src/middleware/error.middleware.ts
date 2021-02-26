import { NextFunction, Request, Response } from "express";
import HttpException from "../exceptions/HttpException";

function errorMiddleware(error: HttpException, request: Request, response: Response, next: NextFunction): void {
  if (response.headersSent) {
    next(error);
  } else {
    const status = error.status || 500;
    let errorMessage = error.message;
    if (error.detail) {
      errorMessage = `${errorMessage} - ${error.detail}`;
    }
    const message = errorMessage || "Something went wrong";
    response.status(status).send({
      message,
      status
    });
  }
}

export default errorMiddleware;
