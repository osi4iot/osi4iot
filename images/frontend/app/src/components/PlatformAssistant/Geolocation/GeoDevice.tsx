import { FC, useEffect, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwinState } from "./GeolocationContainer";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { DeviceSvgImage } from "./DeviceSvgImage";



interface GeoDeviceProps {
    deviceData: IDevice;
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    selectMasterDevice: (masterDeviceSelected: IDevice | null) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

const setDeviceCircleColor = (deviceId: number, deviceSelected: IDevice | null): string => {
    let color = NON_SELECTED;
    if (deviceSelected && deviceId === deviceSelected.id) {
        return SELECTED;
    }
    return color;
}


const deviceRadio = 0.0006;
const circleRadio = 0.0020;

const GeoDevice: FC<GeoDeviceProps> = ({
    deviceData,
    deviceSelected,
    selectDevice,
    selectMasterDevice,
    digitalTwinsState
}) => {
    const devicesStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.deviceId === deviceData.id);
    const status = findOutStatus(devicesStateFiltered);
    const map = useMap();

    const bounds = useMemo(() => calcGeoBounds(deviceData.longitude, deviceData.latitude, deviceRadio), [deviceData]);
    const outerBounds = useMemo(() => calcGeoBounds(deviceData.longitude, deviceData.latitude, circleRadio), [deviceData]);


    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
        selectDevice(deviceData);
        selectMasterDevice(null);
    }


    useEffect(() => {
        if (deviceSelected?.id === deviceData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [deviceSelected, deviceData.id, outerBounds, map]);

    return (
        <Circle
            center={[deviceData.latitude, deviceData.longitude]}
            pathOptions={{ color: setDeviceCircleColor(deviceData.id, deviceSelected), fillColor: "#555555", fillOpacity: 1 }}
            radius={1.5}
            eventHandlers={{ click: clickHandler }}
        >
            {
                status === "ok" && <DeviceSvgImage fillColor={STATUS_OK} bounds={bounds as LatLngTuple[]} />
            }
            {
                status === "pending" && <DeviceSvgImage fillColor={STATUS_PENDING} bounds={bounds as LatLngTuple[]} />
            }
            {
                status === "alerting" && <DeviceSvgImage fillColor={STATUS_ALERTING} bounds={bounds as LatLngTuple[]} />
            }
            <Tooltip sticky>
                <span style={{ fontWeight: 'bold' }}>Device</span><br />
                Name: {deviceData.name}<br />
                Type: {deviceData.type}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </Tooltip>
        </Circle >
    )
}

export default GeoDevice;