/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-explicit-any */
function setSubsetOfObjectProperties<T, U>(itemData: T, constraintArray: string[]): Partial<U> {
	const updatedItem: Partial<U> = {};
	for (const [key, value] of Object.entries(itemData)) {
		if (constraintArray.indexOf(key) === -1) {
			(updatedItem as Record<string, any>)[key] = value;
		}
	}
	return updatedItem;
}

export default setSubsetOfObjectProperties;
