import IUser from "../../components/user/interfaces/User.interface";
import IUserInOrg from "../../components/user/interfaces/UserInOrg.interface";

const generateLastSeenAtAgeString = (lastSeenAtAge: string): string => {
	const objectArray = Object.entries(lastSeenAtAge);
	let lastSeenAtAgeString = "";
	objectArray.forEach(([key, value]) => {
		if (key === "milliseconds" || key === "milliseconds") {
			key = "ms";
		} else key = key.slice(0, 1);
		lastSeenAtAgeString = `${lastSeenAtAgeString}${value}${key} `
	});
	return lastSeenAtAgeString.slice(0, -1);
}

export default generateLastSeenAtAgeString;