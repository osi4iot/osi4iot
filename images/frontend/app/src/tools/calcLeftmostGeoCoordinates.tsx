import { IFeatureCollection } from './spacesDivider';


export const calcLeftmostGeoCoordinates = (geojsonData: IFeatureCollection): number[] => {
    const feature = geojsonData.features[0];
    let leftMostCoordinates = [180, 0];
    const coordinates = feature.geometry.coordinates[0];
    coordinates.forEach(point => {
        if (point[0] < leftMostCoordinates[0]) {
            leftMostCoordinates[0] = point[0];
            leftMostCoordinates[1] = point[1];
        }
    })
    return leftMostCoordinates;
}