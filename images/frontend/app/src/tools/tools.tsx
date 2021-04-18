export const isRegistrationRequest = () => {
    let isRegistrationReq = false;
    const location = window.location.href;
    const wordsArray = location.split("/");
    if (wordsArray[3].slice(0, 8) === "register") isRegistrationReq = true; //Development case

    //Production case
    if (wordsArray[3] === "admin") {
        if (wordsArray[4].slice(0, 8) === "register") isRegistrationReq = true;
    }
  
    return isRegistrationReq
};

export const getDomainName = () => {
    const location = window.location.href;
    let domainName = location.split("/")[2];
    if (domainName === "localhost:3000") domainName = "localhost";  //Development case
    return domainName;
}

export const isValidText = (text: string): boolean => {
	let isValid = true;
	if (text.trim() === "") isValid = false;
	return isValid;
};

export const isValidEmail = (email: string): boolean => {
	let isValid = true;
	/* eslint-disable no-useless-escape */
	/* eslint-disable max-len */
	const EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!EMAIL_REGEX.test(email)) {
		isValid = false;
	}
	return isValid;
};

export const isValidPassword = (password: string): boolean => {
	let isValid = true;
	if (password.trim() === "" || password.trim().length < 4) isValid = false;
	return isValid;
};
