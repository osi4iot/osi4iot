import { FC, useEffect } from "react";
import { useMap, LayerGroup } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwinState } from "../GeolocationContainer";
import { IBuilding } from "../TableColumns/buildingsColumns";
import { IFloor } from "../TableColumns/floorsColumns";
import GeoBuildingWithState from "./GeoBuildingWithState";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";


interface GeoBuildingsProps {
    outerBounds: number[][];
    buildings: IBuilding[];
    buildingSelected: IBuilding | null;
    selectBuilding: (buildingSelected: IBuilding) => void;
    floors: IFloor[];
    floorSelected: IFloor | null;
    selectFloor: (floorSelected: IFloor) => void;
    orgSelected: IOrgOfGroupsManaged | null;
    orgsData: IOrgOfGroupsManaged[];
    selectOrg: (orgSelected: IOrgOfGroupsManaged) => void;
    groupSelected: IGroupManaged | null;
    groupsManaged: IGroupManaged[];
    selectGroup: (groupSelected: IGroupManaged) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const GeoBuildings: FC<GeoBuildingsProps> = ({
    outerBounds,
    buildings,
    buildingSelected,
    selectBuilding,
    floors,
    floorSelected,
    selectFloor,
    orgSelected,
    orgsData,
    selectOrg,
    groupSelected,
    groupsManaged,
    selectGroup,
    digitalTwinsState
}) => {
    const map = useMap();

    useEffect(() => {
        map.fitBounds(outerBounds as LatLngTuple[]);
    }, [map, outerBounds])

    return (
        <LayerGroup>
            {
                buildings.map(building => 
                    <GeoBuildingWithState
                        key={building.id}
                        orgsInBuilding={orgsData.filter(org => org.buildingId === building.id)}
                        buildingData={building}
                        floorsData={floors.filter(floor => floor.buildingId === building.id)}
                        selectFloor={selectFloor}
                        floorSelected={floorSelected}
                        buildingSelected={buildingSelected}
                        selectBuilding={selectBuilding}
                        orgSelected={orgSelected}
                        selectOrg={selectOrg}
                        groupsManaged={groupsManaged}
                        groupSelected={groupSelected}
                        selectGroup={selectGroup}
                        digitalTwinsState={digitalTwinsState}
                    />
                )
            }
        </LayerGroup>
    )
}

export default GeoBuildings;