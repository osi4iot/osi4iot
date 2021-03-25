import generator from "generate-password";

export const passwordGenerator = (length: number): string => {
	const password = generator.generate({ length, numbers: true });
	return password;
};

export const multiplePasswordGenerator = (num: number, length: number): string[] => {
	const passwordsArray = generator.generateMultiple(num, { length, numbers: true });
	return passwordsArray;
};