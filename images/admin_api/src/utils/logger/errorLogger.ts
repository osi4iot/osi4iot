import { Request, Response } from "express";
import { logger } from "../../config/winston";

const errorLogger = (req: Request, res: Response, status: number, message: string) => {
	const options = {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hour12: false,
		timeZoneName: 'short'
	};
	const date = (new Date()).toLocaleString('en-US', options as Intl.DateTimeFormatOptions);
	logger.error(`${req.ip} - - [${date}] "${req.method} ${req.httpVersion} ${req.originalUrl}" ${status} - ${message} \n`);
}

export default errorLogger;