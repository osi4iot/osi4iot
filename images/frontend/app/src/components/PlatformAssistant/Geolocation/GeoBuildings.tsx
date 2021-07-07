import { FC, useEffect } from "react";
import { useMap, LayerGroup } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import GeoOrg from './GeoOrg';
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwinState } from "../GeolocationContainer";
import { IBuilding } from "../TableColumns/buildingsColumns";
import GeoBuilding from "./GeoBuilding";


interface GeoBuildingsProps {
    outerBounds: number[][];
    buildings: IBuilding[];
    orgSelected: IOrgManaged | null;
    digitalTwinsState: IDigitalTwinState[];
}

const GeoBuildings: FC<GeoBuildingsProps> = ({ outerBounds, buildings, orgSelected, digitalTwinsState }) => {
    const map = useMap();

    useEffect(() => {
        map.fitBounds(outerBounds as LatLngTuple[]);
    }, [map, outerBounds])

    return (
        <LayerGroup>
            {
                buildings.map(building =>
                    <GeoBuilding
                        key={building.id}
                        buildingData={building}
                        orgSelected={orgSelected}
                        digitalTwinsState={digitalTwinsState}
                    />
                )

            }
        </LayerGroup>
    )
}

export default GeoBuildings;