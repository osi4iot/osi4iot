export const isRegistrationRequest = () => {
    let isRegistrationReq = false;
    const location = window.location.href;
    const wordsArray = location.split("/");
    if (wordsArray[3] === "register") isRegistrationReq = true; //Development case

    //Production case
    if (wordsArray[3] === "admin") {
        if (wordsArray[4].slice(0, 8) === "register") isRegistrationReq = true;
    }
  
    return isRegistrationReq
};
