const sleep = async (fn: (...argsFn: any[]) => void, ms: number, ...args: any[]): Promise<any> => {
	return new Promise((resolve) => {
		setTimeout(() => resolve(fn(...args)), ms)
	})
}

export default sleep;