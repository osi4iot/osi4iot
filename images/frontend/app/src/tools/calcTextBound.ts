import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';

const calcTextBounds = (pointLongitude: number, pointLatitude: number, width: number, height: number) => {
    const pt = point([pointLongitude, pointLatitude]);
    let angle = 90.0;
    if (height !== 0.0) {
        angle = 180.0* Math.atan(width / height) / Math.PI;
    }
    const module = Math.sqrt(width * width + height * height);
    const bearingMax = angle;
    const maxCoords = rhumbDestination(pt, 0.5 * module, bearingMax);

    const bearingMin = -180 + angle; 
    const minCoords = rhumbDestination(pt, 0.5 * module, bearingMin);

    const bounds = [
        [minCoords.geometry.coordinates[1], minCoords.geometry.coordinates[0]],
        [maxCoords.geometry.coordinates[1], maxCoords.geometry.coordinates[0]]
    ];

    return bounds;
}

export default calcTextBounds;