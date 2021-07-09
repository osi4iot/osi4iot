import { FC, useEffect, useRef } from "react";
import { GeoJSON, LayerGroup, useMap } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import GeoDevice from './GeoDevice';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDevice } from "../TableColumns/devicesColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoDigitalTwins from "./GeoDigitalTwins";
import { IDigitalTwinState } from "../GeolocationContainer";
import { findOutStatus } from "./statusTools";
import { IFloor } from "../TableColumns/floorsColumns";

const STATUS_OK = "#3e3f3b";
const STATUS_ALERTING = "#ff4040";
const STATUS_PENDING = "#f79520";
const SELECTED = "#3274d9";
const NORMAL = "#9c9a9a";


const setGroupStyle = (groupStatus: string, isSelected: boolean) => {
    let fillColor = STATUS_OK;
    if (groupStatus === "pending") fillColor = STATUS_PENDING;
    else if (groupStatus === "alerting") fillColor = STATUS_ALERTING;

    let color = NORMAL;
    if (isSelected) color = SELECTED;
    
    return {
        stroke: true,
        color,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor,
        fillOpacity: 0.5
    }
}

const findOutIfGroupIsSelected = (groupData: IGroupManaged, groupSelected: IGroupManaged | null) => {
    let isGroupSelected = false;
    if (groupSelected) {
        isGroupSelected = groupSelected.id === groupData.id;
    }
    return isGroupSelected;
}

interface GeoGroupProps {
    floorData: IFloor;
    groupData: IGroupManaged;
    groupSelected: IGroupManaged | null;
    selectGroup: (groupSelected: IGroupManaged) => void;
    deviceDataArray: IDevice[];
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const GeoGroup: FC<GeoGroupProps> = (
    {
        floorData,
        groupData,
        groupSelected,
        selectGroup,
        deviceDataArray,
        deviceSelected,
        selectDevice,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState
    }) => {
    const map = useMap();
    const geoJsonLayerGroupData = useRef(null);
    const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);
    const deviceDataArrayFiltered = deviceDataArray.filter(device => device.groupId === groupData.id);
    const isGroupSelected = findOutIfGroupIsSelected(groupData, groupSelected);

    const styleGeoGroupJson = (geoJsonFeature: any) => {
        const groupsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.groupId === groupData.id);
        const status = findOutStatus(groupsStateFiltered);
        return setGroupStyle(status, isGroupSelected);
    }

    useEffect(() => {
        if (Object.keys(groupData.geoJsonData).length !== 0) {
            const currenGeoJsonLayerGroupData = geoJsonLayerGroupData.current;
            if (currenGeoJsonLayerGroupData) {
                (currenGeoJsonLayerGroupData as any)
                    .clearLayers()
                    .addData(groupData.geoJsonData)
                    .setStyle(setGroupStyle("OK", isGroupSelected));
            }
        }
    }, [groupData, isGroupSelected]);


    const clickHandler = () => {
        selectGroup(groupData);
        map.fitBounds(groupData.outerBounds as LatLngTuple[]);
    }

    return (
        <>
            {
                (Object.keys(groupData.geoJsonData).length !== 0) ?
                    <LayerGroup>
                        <GeoJSON data={groupData.geoJsonData} style={styleGeoGroupJson} eventHandlers={{ click: clickHandler }} >
                            <Tooltip sticky>Group: {groupData.acronym}</Tooltip>
                        </GeoJSON>
                        {
                            deviceDataArrayFiltered.map(deviceData =>
                                <GeoDevice
                                    key={deviceData.id}
                                    deviceData={deviceData}
                                    deviceSelected={deviceSelected}
                                    selectDevice={selectDevice}
                                    digitalTwinsState={digitalTwinsState}
                                />
                            )
                        }
                        {
                            deviceSelected &&
                            <GeoDigitalTwins
                                deviceSelected={deviceSelected}
                                digitalTwins={digitalTwinsFiltered}
                                digitalTwinSelected={digitalTwinSelected}
                                selectDigitalTwin={selectDigitalTwin}
                                digitalTwinsState={digitalTwinsState}
                            />
                        }
                    </LayerGroup >
                    :
                    null
            }
        </>
    )
}

export default GeoGroup;