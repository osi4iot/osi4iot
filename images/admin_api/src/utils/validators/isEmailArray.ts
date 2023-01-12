/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerDecorator, ValidationOptions } from "class-validator";
import EMAIL_REGEX from "./emailRegex";

export const isEmailsArrayCheck = (emailsArray: string[]): boolean => {
	let isArrayOfEmails = true;
	if (emailsArray instanceof Array) {
		for (const email of emailsArray) {
			if (!EMAIL_REGEX.test(email)) {
				isArrayOfEmails = false;
				break;
			}
		}
	} else {
		isArrayOfEmails = false;
	}

	return isArrayOfEmails;
};

export const IsEmailsArray = (validationOptions?: ValidationOptions) => {
	return (object: Record<string, any>, propertyName: string): void => {
		registerDecorator({
			name: "isEmailsArray",
			target: object.constructor,
			propertyName,
			constraints: [],
			options: validationOptions,
			validator: {
				// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
				validate(value: any): boolean | Promise<boolean> {
					return isEmailsArrayCheck(value as string[]);
				}
			},
		});
	};
}
