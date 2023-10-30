import { FC, useEffect } from "react";
import { GeoJSON, useMap } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IBuilding } from "../TableColumns/buildingsColumns";

const setBuildingStyle = () => {
    return {
        stroke: true,
        color: "#9c9a9a",
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor: "#3e3f3b",
        fillOpacity: 0.2,
    }
}

interface GeoBuildingProps {
    outerBounds: number[][];
    buildingData: IBuilding;
    isNecessaryToFitBounds?: boolean
}

const GeoBuilding: FC<GeoBuildingProps> = ({ outerBounds, buildingData, isNecessaryToFitBounds = true }) => {
    const styleGeoJson = (geoJsonFeature: any) => {
        return setBuildingStyle();
    }

    const map = useMap();

    useEffect(() => {
        if (isNecessaryToFitBounds) {
            map.fitBounds(outerBounds as LatLngTuple[]);
        }
    }, [map, outerBounds, isNecessaryToFitBounds])

    return (
        <GeoJSON data={buildingData.geoJsonData} style={styleGeoJson} />
    )
}

export default GeoBuilding;