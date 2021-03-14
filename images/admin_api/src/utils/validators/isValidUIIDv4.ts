const UUID_REGEX = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

function isValidUUIDv4(id: string): boolean {
	return UUID_REGEX.test(id);
}

export default isValidUUIDv4;
