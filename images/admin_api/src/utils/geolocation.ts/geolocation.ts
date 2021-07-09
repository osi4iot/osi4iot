export const giveGeolocationPoint = (longitude: number, latitude: number): string => {
	const geolocation = `(${longitude},${latitude})`;
	return geolocation;
}

export const giveDefaultGeolocation = (): string => {
	const defaultLocation = `(${process.env.MAIN_ORGANIZATION_LONGITUDE},${process.env.MAIN_ORGANIZATION_LATITUDE})`;
	return defaultLocation;
}

export const findBuildingBounds = (geoJsonDataString: any): number[][] => {
	let maxLongitude = -180;
	let minLongitude = 180;
	let maxLatitude = -90;
	let minLatitude = 90;
	const geoJsonData = JSON.parse(geoJsonDataString);
	if (geoJsonData.features && geoJsonData.features.length !== 0) {
		const coordsArray = (geoJsonData.features[0].geometry).coordinates[0];
		coordsArray.forEach((coords: number[]) => {
			if (coords[0] > maxLongitude) maxLongitude = coords[0];
			if (coords[0] < minLongitude) minLongitude = coords[0];
			if (coords[1] > maxLatitude) maxLatitude = coords[1];
			if (coords[1] < minLatitude) minLatitude = coords[1];
		})
	}
	const outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
	return outerBounds;
}

export const findFloorOrGroupBounds = (geoJsonDataString: any): number[][] => {
	let maxLongitude = -180;
	let minLongitude = 180;
	let maxLatitude = -90;
	let minLatitude = 90;
	let outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
	const geoJsonData = JSON.parse(geoJsonDataString);
	const features = geoJsonData.features;
	features.forEach((feature: any) => {
		const coordsArray = feature.geometry.coordinates[0];
		coordsArray.forEach((coords: number[]) => {
			if (coords[0] > maxLongitude) maxLongitude = coords[0];
			if (coords[0] < minLongitude) minLongitude = coords[0];
			if (coords[1] > maxLatitude) maxLatitude = coords[1];
			if (coords[1] < minLatitude) minLatitude = coords[1];
		})
		outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
	})
	return outerBounds;
}
