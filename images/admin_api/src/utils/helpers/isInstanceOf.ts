function isInstanceOf<T>(instance: T, keysArray: string[]): instance is T {
	keysArray.sort();
	const instanceKeys = Object.keys(instance);
	instanceKeys.sort();
	return JSON.stringify(keysArray) === JSON.stringify(instanceKeys);
}

export default isInstanceOf;
