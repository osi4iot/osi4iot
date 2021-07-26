const arrayCompare = (a1: any, a2: any) => {
	if (!a1 || !a2) return false;
	if (a1.length !== a2.length) {
		return false;
	}
	for (const i in a1) {
		// Don't forget to check for arrays in our arrays.
		if (a1[i] instanceof Array && a2[i] instanceof Array) {
			if (!arrayCompare(a1[i], a2[i])) {
				return false;
			}
		}
		else if (a1[i] !== a2[i]) {
			return false;
		}
	}
	return true;
};

export default arrayCompare;