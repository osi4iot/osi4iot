import { FC, useEffect, useRef } from "react";
import { GeoJSON, LayerGroup } from 'react-leaflet';
import GeoDevice from './GeoDevice';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { IDevice } from "../TableColumns/devicesColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoDigitalTwins from "./GeoDigitalTwins";
import { IDigitalTwinState } from "../GeolocationContainer";
import { findOutStatus } from "./statusTools";
// import { geoJsonGroupText } from "./geoJsonGroupText";

const STATUS_OK = "#3e3f3b";
const STATUS_ALERTING = "#ff4040";
const STATUS_PENDING = "#f79520";
const NORMAL = "#9c9a9a";
const SELECTED = "#3274d9";

const baseGroupStyle = () => {
    return {
        stroke: true,
        color: NORMAL,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor: STATUS_OK,
        fillOpacity: 0.2
    }
}

const orgStyle =  () => {
    return {
        stroke: true,
        color: SELECTED,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor: STATUS_OK,
        fillOpacity: 0.2
    }
}

const setGroupStyle = (groupStatus: string) => {
    let fillColor = STATUS_OK;
    if (groupStatus === "pending") fillColor = STATUS_PENDING;
    else if (groupStatus === "alerting") fillColor = STATUS_ALERTING;
    
    return {
        stroke: true,
        color: SELECTED,
        weight: 3,
        opacity: 1,
        fill: true,
        fillColor,
        fillOpacity: 0.5
    }
}


interface GeoGroupProps {
    orgData: IOrgManaged;
    groupData: IGroupManaged;
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
        orgData,
        groupData,
        deviceDataArray,
        deviceSelected,
        selectDevice,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState
    }) => {
    const geoJsonLayerGroupBase = useRef(null);
    const geoJsonLayerGroupData = useRef(null);

    const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);

    const styleGeoGroupJson = (geoJsonFeature: any) => {
        const groupsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.groupId === groupData.id);
        const status = findOutStatus(groupsStateFiltered);
        return setGroupStyle(status);
    }

    const styleGeoGroupJsonBase = (geoJsonFeature: any) => {
        return baseGroupStyle();
    }

    const styleGeoOrgJson = (geoJsonFeature: any) => {
        return orgStyle();
    }

    useEffect(() => {
        if (Object.keys(groupData.geoJsonDataBase).length !== 0) {
            const currenGeoJsonLayerGroupBase = geoJsonLayerGroupBase.current;
            if (currenGeoJsonLayerGroupBase) {
                (currenGeoJsonLayerGroupBase as any)
                    .clearLayers()
                    .addData(groupData.geoJsonDataBase)
                    .setStyle(baseGroupStyle());
            }
        }

        if (Object.keys(groupData.geoJsonData).length !== 0) {
            const currenGeoJsonLayerGroupData = geoJsonLayerGroupData.current;
            if (currenGeoJsonLayerGroupData) {
                (currenGeoJsonLayerGroupData as any)
                    .clearLayers()
                    .addData(groupData.geoJsonData)
                    .setStyle(setGroupStyle("OK"));
            }
        }
    }, [groupData]);

    return (
        <>
            {
                (Object.keys(groupData.geoJsonDataBase).length !== 0 && Object.keys(groupData.geoJsonData).length !== 0) ?
                    <LayerGroup>
                        <GeoJSON data={groupData.geoJsonDataBase} style={styleGeoGroupJsonBase} />
                        <GeoJSON data={orgData.geoJsonData} style={styleGeoOrgJson} />
                        <GeoJSON data={groupData.geoJsonData} style={styleGeoGroupJson} >
                            <Tooltip sticky>Group: {groupData.acronym}</Tooltip>
                        </GeoJSON>
                        {
                            deviceDataArray.map(deviceData =>
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