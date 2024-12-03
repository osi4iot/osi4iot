import { FeatureCollection, Polygon, MultiPolygon, Geometry, GeoJsonProperties } from 'geojson';
import { IFloor } from '../components/PlatformAssistant/TableColumns/floorsColumns';

interface IGeometry {
    type: "Polygon";
    coordinates: number[][][];
}

interface IFeature {
    type: "Feature";
    properties: {
        id: number
    }
    geometry: IGeometry;
}

interface IFeatureCollection {
    type: "FeatureCollection";
    features: IFeature[];
}

export interface IFloorSpaces {
    floorOutline: FeatureCollection<Geometry, GeoJsonProperties> | {};
    floorSpaces: FeatureCollection<Geometry, GeoJsonProperties>[] | null;
}

export const findGroupGeojsonData = (floor: IFloor, featureId: number): FeatureCollection<Geometry, GeoJsonProperties> | {} => {
    if (Object.keys(floor.geoJsonData).length !== 0) {
        const features = floor.geoJsonData.features;
        if (featureId < features.length) {
            let featureCoordinates: number[][][] = [];
            if (features[featureId].geometry.type === "Polygon") {
                featureCoordinates = (features[featureId].geometry as Polygon).coordinates;
            } else if (features[featureId].geometry.type === "MultiPolygon") {
                featureCoordinates = (features[featureId].geometry as MultiPolygon).coordinates[0];
            }
            const polygonFeature: IFeatureCollection = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            id: featureId
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: featureCoordinates
                        }
                    }
                ]
            }
            return polygonFeature;
        } else return {};

    } else return {};
}