import { FC, useEffect, useState } from "react";
import { Marker } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IAssetType } from "../TableColumns/assetTypesColumns";
import { IAsset } from "../TableColumns/assetsColumns";
import { AssetIconMarker } from "./AssetIconMarker";
import { IBuilding } from "../TableColumns/buildingsColumns";
import { IFloor } from "../TableColumns/floorsColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { findOutStatus } from "./statusTools";

interface GeoAssetMarkerProps {
    asset: IAsset;
    selectAsset: (assetSelected: IAsset | null) => void;
    selectAssetMarker: (select: boolean) => void;
    assetTypes: IAssetType[];
    buildings: IBuilding[];
    selectBuilding: (buildingSelected: IBuilding) => void;
    floors: IFloor[];
    selectFloor: (floorSelected: IFloor) => void;
    orgsData: IOrgOfGroupsManaged[];
    selectOrg: (orgSelected: IOrgOfGroupsManaged) => void;
    groupSelected: IGroupManaged | null;
    groupsManaged: IGroupManaged[];
    selectGroup: (groupSelected: IGroupManaged) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
}

const GeoAssetMarker: FC<GeoAssetMarkerProps> = ({
    asset,
    selectAsset,
    selectAssetMarker,
    assetTypes,
    buildings,
    selectBuilding,
    floors,
    selectFloor,
    orgsData,
    selectOrg,
    groupsManaged,
    selectGroup,
    digitalTwinsState,
    sensorsState,
}) => {
    const assetOrg = orgsData.filter(org => org.id === asset.orgId)[0];
    const assetBuilding = buildings.filter(item => item.id === assetOrg.buildingId)[0];
    const assetGroup = groupsManaged.filter(group => group.id === asset.groupId)[0];
    const assetFloor = floors.filter(floor => floor.buildingId === assetBuilding.id && floor.floorNumber === assetGroup.floorNumber)[0];
    const [status, setStatus] = useState("unknown");
    const sensorStateFiltered = sensorsState.filter(sensor => sensor.assetId === asset.id);

    useEffect(() => {
        const assetsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.assetId === asset.id);
        const status = findOutStatus(assetsStateFiltered, sensorStateFiltered);
        setStatus(status);
    }, [asset, digitalTwinsState, sensorStateFiltered]);

    const clickHandler = () => {
        selectAssetMarker(true);
        selectBuilding(assetBuilding);
        selectFloor(assetFloor);
        selectOrg(assetOrg);
        selectGroup(assetGroup);
        selectAsset(asset);
    }

    return (
        <Marker
            position={[asset.latitude, asset.longitude]}
            eventHandlers={{ click: clickHandler }}
            icon={AssetIconMarker(status, assetTypes.filter(item => item.id === asset.assetTypeId)[0].markerSvgString)}
        >
            <Tooltip sticky opacity={1}>
                <span style={{ fontWeight: 'bold' }}>{`Asset_${asset.assetUid}`}</span><br />
                Org: {assetOrg.acronym} - Group: {assetGroup.acronym}<br />
                Description: {asset.description}<br />
                Type: {asset.assetType}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </Tooltip>
        </Marker>
    )
}

export default GeoAssetMarker;