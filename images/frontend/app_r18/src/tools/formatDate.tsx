const getMonth = (date: Date) => {
    let months: string | number = date.getMonth() + 1;
    if (months < 10) months = `0${months}`;
    return months;
}

const getDay = (date: Date) => {
    let days: string | number = date.getDate();
    if (days < 10) days = `0${days}`;
    return days;
}

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
        formatedDated = date.getFullYear() + "-" + getMonth(date) + "-" + getDay(date) + " " + date.getHours() + ":" + getMinutes(date) + ":" + getSeconds(date);
    }
    return formatedDated;
};

export default formatDateString;