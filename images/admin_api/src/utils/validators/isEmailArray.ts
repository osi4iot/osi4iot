/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerDecorator, ValidationOptions } from "class-validator";
import EMAIL_REGEX from "./emailRegex";

export const isEmailsArrayCheck = (emailsArray: string[]): boolean => {
	let isArrayOfEmails = true;
	if (emailsArray instanceof Array) {
		// tslint:disable-next-line: prefer-for-of
		for (let i = 0; i < emailsArray.length; i++) {
			if (!EMAIL_REGEX.test(emailsArray[i])) {
				isArrayOfEmails = false;
				break;
			}
		}
	} else {
		isArrayOfEmails = false;
	}

	return isArrayOfEmails;
};

export function IsEmailsArray(validationOptions?: ValidationOptions) {
	return (object: Record<string, any>, propertyName: string): void => {
		registerDecorator({
			name: "isEmailsArray",
			target: object.constructor,
			propertyName,
			constraints: [],
			options: validationOptions,
			validator: {
				validate(value: any): boolean | Promise<boolean> {
					return isEmailsArrayCheck(value);
				}
			}
		});
	};
}
