import { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRequestHandler<T extends Request = Request> = (req: T, res: Response, next: NextFunction) => Promise<void>;

const asHandler = <T extends Request>(fn: AsyncRequestHandler<T>) => fn as unknown as RequestHandler;

export default asHandler;