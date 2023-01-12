import { ValidationError as ValErr } from "class-validator";
import * as express from "express";
import { transformAndValidate } from "class-transformer-validator";
import HttpException from "../exceptions/HttpException";
import IRequestWithOrganization from "../components/organization/interfaces/requestWithOrganization.interface";

function errorMessageItem(errorArray: ValErr[]): string {
	return errorArray
		.map((error: ValErr) => {
			let mesgSubItem: string;
			if (!error.children || error.children.length === 0) {
				[mesgSubItem] = Object.values(error.constraints);
			} else {
				mesgSubItem = "";
				for (let i = 0; i < error.children.length; i++) {
					const childArray = error.children[i].children;
					mesgSubItem += childArray.map((err1: ValErr) => Object.values(err1.constraints)).join(", ");
					if (i < error.children.length - 1) {
						mesgSubItem += ", ";
					}
				}
			}
			return mesgSubItem;
		})
		.join(", ");
}

function reducerCallback(result: string[], errorArray: ValErr[]): string[] {
	if (errorArray.length) {
		const mesgItem: string = errorMessageItem(errorArray);
		result.push(mesgItem);
	}
	return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
function validationMiddleware<T>(type: any, skipMissingProperties = false): express.RequestHandler {
	return async (req: IRequestWithOrganization, res, next): Promise<void> => {
		try {
			await transformAndValidate(type, req.body, {
				validator: { skipMissingProperties, whitelist: true, forbidNonWhitelisted: true }
			});
			next();
		} catch (err) {
			const message = Array.isArray(err[0]) ? err.reduce(reducerCallback, []) : errorMessageItem(err);
			next(new HttpException(400, message));
		}
	};
}

export default validationMiddleware;
