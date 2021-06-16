import { FC, useEffect, useRef } from "react";
import { GeoJSON, LayerGroup } from 'react-leaflet';
import GeoDevice from './GeoDevice';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { IDevice } from "../TableColumns/devicesColumns";
// import { geoJsonGroupText } from "./geoJsonGroupText";

const STATUS_OK = "#555555";
const STATUS_ALERT = "#ff4040";
const NORMAL = "#555555";
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

const setGroupStyle = (groupStatus: string) => {
    if (groupStatus !== "OK") {
        return {
            stroke: true,
            color: SELECTED,
            weight: 3,
            opacity: 1,
            fill: true,
            fillColor: STATUS_ALERT,
            fillOpacity: 0.2
        }

    } else {
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
}



interface GeoGroupProps {
    orgData: IOrgManaged;
    groupData: IGroupManaged;
    deviceDataArray: IDevice[];
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
}

const GeoGroup: FC<GeoGroupProps> = ({ orgData, groupData, deviceDataArray, deviceSelected, selectDevice }) => {
    const geoJsonLayerGroupBase = useRef(null);
    const geoJsonLayerGroupData = useRef(null);

    const styleGeoJson = (geoJsonFeature: any) => {
        return setGroupStyle("OK");
    }

    const styleGeoJsonBase = (geoJsonFeature: any) => {
        return baseGroupStyle();
    }

    useEffect(() => {
        const currenGeoJsonLayerGroupBase = geoJsonLayerGroupBase.current;
        if (currenGeoJsonLayerGroupBase) {
            (currenGeoJsonLayerGroupBase as any)
                .clearLayers()
                .addData(groupData.geoJsonBase)
                .setStyle(baseGroupStyle());
        }

        const currenGeoJsonLayerGroupData = geoJsonLayerGroupData.current;
        if (currenGeoJsonLayerGroupData) {
            (currenGeoJsonLayerGroupData as any)
                .clearLayers()
                .addData(groupData.geoJsonData)
                .setStyle(setGroupStyle("OK"));
        }
    }, [groupData]);


    return (
        <LayerGroup>
            <GeoJSON  data={groupData.geoJsonBase} style={styleGeoJsonBase} />
            <GeoJSON  data={orgData.geoJsonData} style={styleGeoJson} />
            <GeoJSON data={groupData.geoJsonData} style={styleGeoJson} >
                <Tooltip sticky>Group: {groupData.acronym}</Tooltip>
            </GeoJSON>
            {
                deviceDataArray.map(deviceData => <GeoDevice key={deviceData.id} deviceData={deviceData} deviceSelected={deviceSelected} selectDevice={selectDevice} />)
            }
        </LayerGroup>
    )
}

export default GeoGroup;