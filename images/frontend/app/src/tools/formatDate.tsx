const getMinutes = (date: Date) => {
    let minutes: string | number = date.getMinutes();
    if (minutes < 10) minutes = `0${minutes}`;
    return minutes;
}

const getSeconds = (date: Date) => {
    let seconds: string | number = date.getSeconds();
    if (seconds < 10) seconds = `0${seconds}`;
    return seconds;
}

const formatDateString = (dateString: string): string => {
    if (!dateString) dateString = "-";
    let formatedDated = dateString;
    if (dateString !== "-") {
        const date = new Date(dateString);
        formatedDated = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " + date.getHours() + ":" + getMinutes(date) + ":" + getSeconds(date);
    }
    return formatedDated;
};

export default formatDateString;