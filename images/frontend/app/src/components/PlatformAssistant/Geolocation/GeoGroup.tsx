import { FC, useRef, useState } from "react";
import { GeoJSON, LayerGroup, useMap } from 'react-leaflet';
import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { LatLngTuple } from 'leaflet';
import GeoDevice from './GeoDevice';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDevice } from "../TableColumns/devicesColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoDigitalTwins from "./GeoDigitalTwins";
import { IDigitalTwinState } from "./GeolocationContainer";
import { findOutStatus } from "./statusTools";
import { IFloor } from "../TableColumns/floorsColumns";
import { findGroupGeojsonData } from "../../../tools/findGroupGeojsonData";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";

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
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
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
        digitalTwinsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }) => {
    const map = useMap();
    const geoJsonLayerGroupRef = useRef(null);
    const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);
    const deviceDataArrayFiltered = deviceDataArray.filter(device => device.groupId === groupData.id);
    const isGroupSelected = findOutIfGroupIsSelected(groupData, groupSelected);
    const groupGeoJsonData = useState(findGroupGeojsonData(floorData, groupData.featureIndex))[0]

    const styleGeoGroupJson = (geoJsonFeature: any) => {
        const groupsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.groupId === groupData.id);
        const status = findOutStatus(groupsStateFiltered);
        return setGroupStyle(status, isGroupSelected);
    }

    const clickHandler = () => {
        selectGroup(groupData);
        let groupOuterBounds = groupData.outerBounds;
        if (!groupOuterBounds) {
            groupOuterBounds = floorData.outerBounds;
        }
        map.fitBounds(groupOuterBounds as LatLngTuple[]);
    }

    return (
        <>
            {
                (Object.keys(groupGeoJsonData).length !== 0) ?
                    <LayerGroup>
                        <GeoJSON
                            ref={geoJsonLayerGroupRef}
                            data={groupGeoJsonData as FeatureCollection<Geometry, GeoJsonProperties>}
                            style={styleGeoGroupJson}
                            eventHandlers={{ click: clickHandler }}
                        >
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
                                openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                                setGlftDataLoading={setGlftDataLoading}
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