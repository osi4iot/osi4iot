import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';

const calcGeoBounds = (pointLongitude: number, pointLatitude: number, radio: number) => {
    const pt = point([pointLongitude, pointLatitude]);
    const bearingMax = 45;
    const maxCoords = rhumbDestination(pt, radio*Math.sqrt(2), bearingMax);

    const bearingMin = -135;
    const minCoords = rhumbDestination(pt, radio*Math.sqrt(2), bearingMin);

    const bounds = [
        [minCoords.geometry.coordinates[1], minCoords.geometry.coordinates[0]],
        [maxCoords.geometry.coordinates[1], maxCoords.geometry.coordinates[0]]
    ];

    return bounds;
}

export default calcGeoBounds;