import { FC } from "react";
import { Marker } from 'react-leaflet';
import { BuildingIconMarker } from "./BuildingIconMarker";
import BuildingTooltip, { IOrgManagedWithStatus } from "./BuildingTooltip";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";

interface BuildingMarkerProps {
    buildingStatus: string,
    clickHandler: () => void;
    buildingLatitude: number,
    buildingLongitude: number,
    buildingName: string,
    orgsInBuilding: IOrgOfGroupsManaged[],
    orgsInBuildingWithStatus: IOrgManagedWithStatus[],
    orgSelected: IOrgOfGroupsManaged | null;
}

const BuildingMarker: FC<BuildingMarkerProps> = (
    {
        buildingStatus,
        clickHandler,
        buildingLatitude,
        buildingLongitude,
        buildingName,
        orgsInBuilding,
        orgsInBuildingWithStatus,
        orgSelected
    }) => {

    return (
        <Marker
            position={[buildingLatitude, buildingLongitude]}
            eventHandlers={{ click: clickHandler }}
            icon={BuildingIconMarker(buildingStatus, orgsInBuilding)}
        >
            <BuildingTooltip
                buildingName={buildingName}
                orgsInBuilding={orgsInBuildingWithStatus}
                orgSelected={orgSelected}
            />
        </Marker>
    )
}

export default BuildingMarker;