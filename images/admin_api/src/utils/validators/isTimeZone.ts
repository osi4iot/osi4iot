/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerDecorator, ValidationOptions } from "class-validator";

// A group's time zone: an IANA name (Europe/Madrid, America/Bogota, UTC),
// or "" when it is not set (the pipelines use UTC then). The AI agents
// show times in it when the user's own is not known (Telegram, voice notes
// from the phone): the chat sends the user's.

export const canonicalTimeZone = (timeZone: string): string | null => {
	if (typeof timeZone !== "string") return null;
	const tz = timeZone.trim();
	if (tz === "") return "";
	if (tz.length > 64) return null;
	try {
		return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
	} catch {
		return null;
	}
};

export const IsTimeZone = (validationOptions?: ValidationOptions) => {
	return (object: Record<string, any>, propertyName: string): void => {
		registerDecorator({
			name: "isTimeZone",
			target: object.constructor,
			propertyName,
			constraints: [],
			options: {
				message: `${propertyName} must be an IANA time zone, e.g. Europe/Madrid or UTC (or empty)`,
				...validationOptions,
			},
			validator: {
				validate: (value: any) => canonicalTimeZone(value) !== null,
			},
		});
	};
};
