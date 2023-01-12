import HttpException from "./HttpException";

class NotValidUUIDv4Exception extends HttpException {
	constructor(itemName: string, id: string) {
		const message = `${itemName} id: '${id}' is not a valid uuid v4`;
		super(400, message);
	}
}

export default NotValidUUIDv4Exception;
