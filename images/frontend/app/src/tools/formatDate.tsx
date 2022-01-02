const formatDateString = (dateString: string): string => {
    if (!dateString) dateString = "-";
    let formatedDated = dateString;
    if (dateString !== "-") {
        const date = new Date(dateString);
        formatedDated = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
    }
    return formatedDated;
};

export default formatDateString;