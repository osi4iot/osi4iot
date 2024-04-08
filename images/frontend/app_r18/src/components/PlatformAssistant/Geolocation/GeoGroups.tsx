import { FC, useState } from "react";
import { GeoJSON, LayerGroup, useMap } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { IFloor } from "../TableColumns/floorsColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoGroup from "./GeoGroup";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { isGeoJSONObject } from "../../../tools/geojsonValidation";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import { IAssetType } from "../TableColumns/assetTypesColumns";


const STATUS_OK = "#3e3f3b";
const NORMAL = "#9c9a9a";

const floorStyle = () => {
    return {
        stroke: true,
        color: NORMAL,
        weight: 1.5,
        opacity: 0.5,
        fill: true,
        fillColor: STATUS_OK,
        fillOpacity: 0.2
    }
}

interface GeoGroupsProps {
    floorData: IFloor;
    orgSelected: IOrgOfGroupsManaged | null;
    selectOrg: (orgSelected: IOrgOfGroupsManaged) => void;
    groupsInSelectedOrg: IGroupManaged[];
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    assetTypes: IAssetType[];
    assetDataArray: IAsset[];
    assetSelected: IAsset | null;
    selectAsset: (assetSelected: IAsset | null) => void;
    sensorDataArray: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}


const GeoGroups: FC<GeoGroupsProps> = (
    {
        floorData,
        groupsInSelectedOrg,
        orgSelected,
        selectOrg,
        groupSelected,
        selectGroup,
        assetTypes,
        assetDataArray,
        assetSelected,
        selectAsset,
        sensorDataArray,
        sensorSelected,
        selectSensor,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState,
        sensorsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }
) => {
    const map = useMap();
    const isValidGeoJsonData = useState(isGeoJSONObject(floorData.geoJsonData))[0];
    const assetTypeDataArray = assetTypes.filter(assetType => assetType.orgId === orgSelected?.id);

    const styleGeoFloorJson = (geoJsonFeature: any) => {
        return floorStyle();
    }

    const clickHandler = () => {
        if (floorData.outerBounds) {
            map.fitBounds(floorData.outerBounds as LatLngTuple[]);
        }
        if (orgSelected) selectOrg(orgSelected);
    }

    return (
        <LayerGroup>
            {
                isValidGeoJsonData &&
                <GeoJSON data={floorData.geoJsonData} style={styleGeoFloorJson} eventHandlers={{ click: clickHandler }} />
            }
            {
                groupsInSelectedOrg.map(group =>
                    <GeoGroup
                        key={group.id}
                        floorData={floorData}
                        groupData={group}
                        groupSelected={groupSelected}
                        selectGroup={selectGroup}
                        assetTypeDataArray={assetTypeDataArray}
                        assetDataArray={assetDataArray}
                        assetSelected={assetSelected}
                        selectAsset={selectAsset}
                        sensorDataArray={sensorDataArray}
                        sensorSelected={sensorSelected}
                        selectSensor={selectSensor}
                        digitalTwins={digitalTwins}
                        digitalTwinSelected={digitalTwinSelected}
                        selectDigitalTwin={selectDigitalTwin}
                        digitalTwinsState={digitalTwinsState}
                        sensorsState={sensorsState}
                        openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                        setGlftDataLoading={setGlftDataLoading}
                    />
                )

            }
        </LayerGroup>
    )
}

export default GeoGroups;