
const lastMinutesDate = (startDate: Date, minutes: number) => {
    const lastMinutes = (new Date()).setMinutes(startDate.getMinutes() - minutes);
    return new Date(lastMinutes);
};

const lastHoursDate = (startDate: Date, hours: number) => {
    const lastHours = (new Date()).setHours(startDate.getHours() - hours);
    return new Date(lastHours);
};

const lastDaysDate = (startDate: Date, days: number) => {
    const lastDays = (new Date()).setHours(startDate.getHours() - 24*days);
    return new Date(lastDays);
}

const lastWeeksDate = (startDate: Date, weeks: number) => {
    const lastWeeks = (new Date()).setHours(startDate.getHours() - 7*24*weeks);
    return new Date(lastWeeks);
}

const lastMonthsDate = (startDate: Date, months: number) => {
    const lastMonths = (new Date()).setMonth(startDate.getMonth() - months);
    return new Date(lastMonths);
}

const lastYearsDate = (startDate: Date, years: number) => {
    const lastYears = (new Date()).setFullYear(startDate.getFullYear() - years);
    return new Date(lastYears);
}

const timeRangeCalculator = (timeRangeString: string) => {
    const timeRangeArray = timeRangeString.split(" ");
    let startDateString = "";
    let endDateString = "";
    if (timeRangeArray[0] === "Last") {
        const endDate = new Date();
        let startDate = new Date();
        endDateString = endDate.toISOString();
        if (timeRangeArray.length === 2) {
            if (timeRangeArray[1] === "minute") startDate = lastMinutesDate(startDate, 1);
            else if (timeRangeArray[1] === "hour") startDate = lastHoursDate(startDate, 1);
            else if (timeRangeArray[1] === "day") startDate = lastDaysDate(startDate, 1);
            else if (timeRangeArray[1] === "week") startDate = lastWeeksDate(startDate, 1);
            else if (timeRangeArray[1] === "month") startDate = lastMonthsDate(startDate, 1);
            else if (timeRangeArray[1] === "year") startDate = lastYearsDate(startDate, 1);
        } else if (timeRangeArray.length === 3) {
            const timeRangeValue = parseInt(timeRangeArray[1], 10)
            if (timeRangeArray[2] === "minutes") startDate = lastMinutesDate(startDate, timeRangeValue);
            else if (timeRangeArray[2] === "hours") startDate = lastHoursDate(startDate, timeRangeValue);
            else if (timeRangeArray[2] === "days") startDate = lastDaysDate(startDate, timeRangeValue);
            else if (timeRangeArray[2] === "weeks") startDate = lastWeeksDate(startDate, timeRangeValue);
            else if (timeRangeArray[2] === "months") startDate = lastMonthsDate(startDate, timeRangeValue);
            else if (timeRangeArray[2] === "years") startDate = lastYearsDate(startDate, timeRangeValue);
        }
        startDateString = startDate.toISOString();
    }
    return [startDateString, endDateString];
}

export default timeRangeCalculator;