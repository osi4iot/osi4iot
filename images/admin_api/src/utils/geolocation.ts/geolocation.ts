export const giveGeolocationPoint = (longitude: number, latitude: number): string => {
	const geolocation = `(${longitude},${latitude})`;
	return geolocation;
}

export const giveDefaultGeolocation = (): string => {
	const defaultLocation = `(${process.env.MAIN_ORGANIZATION_LONGITUDE},${process.env.MAIN_ORGANIZATION_LATITUDE})`;
	return defaultLocation;
}
