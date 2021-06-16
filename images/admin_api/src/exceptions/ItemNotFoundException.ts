import HttpException from "./HttpException";

class ItemNotFoundException extends HttpException {
	constructor(itemName: string, propName: string, propValue: string) {
		const message = `${itemName} with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default ItemNotFoundException;
