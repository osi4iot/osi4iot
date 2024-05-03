import { FC, useEffect } from "react";
import { useMap, LayerGroup } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { IBuilding } from "../TableColumns/buildingsColumns";
import { IFloor } from "../TableColumns/floorsColumns";
import GeoBuildingWithState from "./GeoBuildingWithState";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { IAssetType } from "../TableColumns/assetTypesColumns";
import { IAsset } from "../TableColumns/assetsColumns";
import GeoAssetMarker from "./GeoAssetMarker";


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
    sensorsState: ISensorState[];
    assetTypes: IAssetType[];
    assetsWithMarker: IAsset[];
    selectAsset: (assetSelected: IAsset | null) => void;
    assetMarkerSelected: boolean;
    selectAssetMarker: (select: boolean) => void;
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
    digitalTwinsState,
    sensorsState,
    assetTypes,
    assetsWithMarker,
    selectAsset,
    assetMarkerSelected,
    selectAssetMarker
}) => {
    const map = useMap();

    useEffect(() => {
        if (!buildingSelected) {
            map.fitBounds(outerBounds as LatLngTuple[]);
        }
    }, [map, outerBounds, buildingSelected]);

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
                        sensorsState={sensorsState}
                    />
                )
            }
            {
                assetsWithMarker.map(asset =>
                    !assetMarkerSelected &&
                    <GeoAssetMarker
                        key={asset.id}
                        asset={asset}
                        selectAsset={selectAsset}
                        selectAssetMarker={selectAssetMarker}
                        assetTypes={assetTypes}
                        buildings={buildings}
                        selectBuilding={selectBuilding}
                        floors={floors}
                        selectFloor={selectFloor}
                        orgsData={orgsData}
                        selectOrg={selectOrg}
                        groupsManaged={groupsManaged}
                        groupSelected={groupSelected}
                        selectGroup={selectGroup}
                        digitalTwinsState={digitalTwinsState}
                        sensorsState={sensorsState}
                    />
                )
            }
        </LayerGroup>
    )
}

export default GeoBuildings;