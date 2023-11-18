import { IFloor } from '../components/PlatformAssistant/TableColumns/floorsColumns';

interface IGeometry {
    type: "Polygon";
    coordinates: number[][][];
}

interface IFeature {
    type: "Feature";
    properties: {
        index: number
    }
    geometry: IGeometry;
}

export interface IFeatureCollection {
    type: "FeatureCollection";
    features: IFeature[];
}

export interface IFloorSpaces {
    floorOutline: IFeatureCollection | null;
    floorSpaces: IFeatureCollection[] | null;
}

export const spacesDivider = (floor: IFloor | null): IFloorSpaces => {
    if (floor) {
        const features = floor.geoJsonData.features;
        const polygonFeatures = features.map((feature, index) => {
            let featureCoordinates: number[][][] = [];
            if (feature.geometry.type === "Polygon") {
                featureCoordinates = feature.geometry.coordinates;
            } else if (feature.geometry.type === "MultiPolygon") {
                featureCoordinates = feature.geometry.coordinates[0];
            }
            const polygonFeature: IFeatureCollection = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            index
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: featureCoordinates
                        }
                    }
                ]
            }
            return polygonFeature;
        });
        const floorSpaces = {
            floorOutline: polygonFeatures[0],
            floorSpaces: polygonFeatures.slice(1)
        }
        return floorSpaces;

    } else {
        const floorSpaces = {
            floorOutline: null,
            floorSpaces: null
        }
        return floorSpaces;
    }

}