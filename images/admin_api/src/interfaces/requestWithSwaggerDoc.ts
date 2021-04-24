import { Request } from "express";

interface IRequestWithSwaggerDoc extends Request {
	swaggerDoc: any;
}

export default IRequestWithSwaggerDoc;
