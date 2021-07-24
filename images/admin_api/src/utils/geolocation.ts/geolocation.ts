import CreateFloorDto from "../../components/building/floor.dto";
import IFloor from "../../components/building/floor.interface";

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
		let coordsArray: number[][];
		if (geoJsonData.features[0].geometry.type === "Polygon") {
			coordsArray = (geoJsonData.features[0].geometry).coordinates[0];
		} else if (geoJsonData.features[0].geometry.type === "MultiPolygon") {
			coordsArray = (geoJsonData.features[0].geometry).coordinates[0][0];
		}
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

export const findGroupBounds = (geoJsonDataString: string,  floorData: IFloor): number[][] => {
	let maxLongitude = -180;
	let minLongitude = 180;
	let maxLatitude = -90;
	let minLatitude = 90;
	let outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
	const geoJsonData = JSON.parse(geoJsonDataString);
	const features = geoJsonData.features;
	if (features && features.length !== 0) {
		features.forEach((feature: any) => {
			let coordsArray: number[][];
			if (feature.geometry.type === "Polygon") {
				coordsArray = feature.geometry.coordinates[0];
			} else if (feature.geometry.type === "MultiPolygon") {
				coordsArray = feature.geometry.coordinates[0][0];
			}
			coordsArray.forEach((coords: number[]) => {
				if (coords[0] > maxLongitude) maxLongitude = coords[0];
				if (coords[0] < minLongitude) minLongitude = coords[0];
				if (coords[1] > maxLatitude) maxLatitude = coords[1];
				if (coords[1] < minLatitude) minLatitude = coords[1];
			})
			outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
		})
	} else {
		outerBounds = floorData.outerBounds;
	}
	return outerBounds;
}

export const findFloorBounds = (floorData: IFloor | CreateFloorDto): number[][] => {
	let maxLongitude = -180;
	let minLongitude = 180;
	let maxLatitude = -90;
	let minLatitude = 90;
	let outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
	const features = (floorData.geoJsonData as any).features;
	if (features && features.length !== 0) {
		features.forEach((feature: any) => {
			let coordsArray: number[][];
			if (feature.geometry.type === "Polygon") {
				coordsArray = feature.geometry.coordinates[0];
			} else if (feature.geometry.type === "MultiPolygon") {
				coordsArray = feature.geometry.coordinates[0][0];
			}
			coordsArray.forEach((coords: number[]) => {
				if (coords[0] > maxLongitude) maxLongitude = coords[0];
				if (coords[0] < minLongitude) minLongitude = coords[0];
				if (coords[1] > maxLatitude) maxLatitude = coords[1];
				if (coords[1] < minLatitude) minLatitude = coords[1];
			})
			outerBounds = [[minLatitude, minLongitude], [maxLatitude, maxLongitude]];
		})
	} else {
		outerBounds = floorData.outerBounds;
	}
	return outerBounds;
}


export const findGroupGeojsonData = (floor: IFloor, featureIndex: number): string => {
	const floorGeoJsonData = floor.geoJsonData;
	if (Object.keys(floorGeoJsonData).length !== 0) {
		const features = (floorGeoJsonData as any).features;
		let featureCoordinates: number[][][] = [];
		if (features[featureIndex].geometry.type === "Polygon") {
			featureCoordinates = features[featureIndex].geometry.coordinates;
		} else if (features[featureIndex].geometry.type === "MultiPolygon") {
			featureCoordinates = features[featureIndex].geometry.coordinates[0];
		}
		const polygonFeature = {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: {
						id: featureIndex
					},
					geometry: {
						type: "Polygon",
						coordinates: featureCoordinates
					}
				}
			]
		}
		return JSON.stringify(polygonFeature);

	} else return "{}";
}
