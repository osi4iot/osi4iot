import { FC, useState } from "react";
import { GeoJSON, LayerGroup, useMap } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwinState } from "./GeolocationContainer";
import { IFloor } from "../TableColumns/floorsColumns";
import { IDevice } from "../TableColumns/devicesColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoGroup from "./GeoGroup";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { isGeoJSONObject } from "../../../tools/geojsonValidation";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";


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
    deviceDataArray: IDevice[];
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    masterDeviceSelected: IDevice | null;
    selectMasterDevice: (masterDeviceSelected: IDevice | null) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
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
        deviceDataArray,
        deviceSelected,
        selectDevice,
        masterDeviceSelected,
        selectMasterDevice,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }
) => {
    const map = useMap();
    const isValidGeoJsonData = useState(isGeoJSONObject(floorData.geoJsonData))[0];

    const styleGeoFloorJson = (geoJsonFeature: any) => {
        return floorStyle();
    }

    const clickHandler = () => {
        map.fitBounds(floorData.outerBounds as LatLngTuple[]);
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
                        deviceDataArray={deviceDataArray}
                        deviceSelected={deviceSelected}
                        selectDevice={selectDevice}
                        masterDeviceSelected={masterDeviceSelected}
                        selectMasterDevice={selectMasterDevice}
                        digitalTwins={digitalTwins}
                        digitalTwinSelected={digitalTwinSelected}
                        selectDigitalTwin={selectDigitalTwin}
                        digitalTwinsState={digitalTwinsState}
                        openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                        setGlftDataLoading={setGlftDataLoading}
                    />
                )

            }
        </LayerGroup>
    )
}

export default GeoGroups;