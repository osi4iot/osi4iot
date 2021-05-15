const elaspsedTimeFormat = (elaspsedTimeString: string): string => {
    const timeArray = elaspsedTimeString.split(" ");
    const maxTime = timeArray[0].slice(-1);
    let newElaspsedTimeString;
    if (maxTime === "s" || maxTime === "ms") {
        newElaspsedTimeString = "<1m";
    } else {
        const newTimeArray = timeArray.slice(0, 2);
        newElaspsedTimeString = newTimeArray.join(" ");
    }
    return newElaspsedTimeString;
}

export default elaspsedTimeFormat;