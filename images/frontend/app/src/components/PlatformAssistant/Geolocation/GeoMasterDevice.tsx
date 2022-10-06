import { FC, useEffect, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwinState } from "./GeolocationContainer";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { MaterialDeviceSvgImage } from "./MaterialDeviceSvgImage";



interface GeoMasterDeviceProps {
    deviceData: IDevice;
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    digitalTwinsState: IDigitalTwinState[];
}


const GeoMasterDevice: FC<GeoMasterDeviceProps> = ({
    deviceData,
    deviceSelected,
    selectDevice,
    digitalTwinsState
}) => {
    const devicesStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.deviceId === deviceData.id);
    const status = findOutStatus(devicesStateFiltered);
    const map = useMap();

    const outerBounds = useMemo(() => calcGeoBounds(deviceData.longitude, deviceData.latitude, deviceData.iconRadio * 0.001), [deviceData]);
    const bounds = useMemo(() => calcGeoBounds(deviceData.longitude, deviceData.latitude, deviceData.iconRadio * 0.0004), [deviceData]);


    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
        selectDevice(deviceData);
    }

    const clickMasterDeviceHandler = () => {
        window.open(deviceData.masterDeviceUrl, "_blank");
    }

    useEffect(() => {
        if (deviceSelected?.id === deviceData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [deviceSelected, deviceData.id, outerBounds, map]);

    return (
        <>
            <Circle
                center={[deviceData.latitude, deviceData.longitude]}
                pathOptions={{ stroke: false, fillOpacity: 0 }}
                radius={deviceData.iconRadio}
                eventHandlers={{ click: clickHandler }}
            >
                {
                    status === "ok" &&
                    <MaterialDeviceSvgImage
                        deviceId={deviceData.id}
                        deviceSelected={deviceSelected as IDevice}
                        fillColor={STATUS_OK}
                        bounds={bounds as LatLngTuple[]}
                        outerBounds={outerBounds as LatLngTuple[]}
                    />
                }
                {
                    status === "pending" &&
                    <MaterialDeviceSvgImage
                        deviceId={deviceData.id}
                        deviceSelected={deviceSelected as IDevice}
                        fillColor={STATUS_PENDING}
                        bounds={bounds as LatLngTuple[]}
                        outerBounds={outerBounds as LatLngTuple[]}
                    />
                }
                {
                    status === "alerting" &&
                    <MaterialDeviceSvgImage
                        deviceId={deviceData.id}
                        deviceSelected={deviceSelected as IDevice}
                        fillColor={STATUS_ALERTING}
                        bounds={bounds as LatLngTuple[]}
                        outerBounds={outerBounds as LatLngTuple[]}
                    />
                }
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Device</span><br />
                    Name: {deviceData.name}<br />
                    Type: {deviceData.type}<br />
                    Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                </Tooltip>
            </Circle >
            {
                (deviceSelected && deviceData.id === deviceSelected.id) &&
                <Circle
                    center={[deviceData.latitude, deviceData.longitude]}
                    pathOptions={{ stroke: false, fillOpacity: 0 }}
                    radius={deviceData.iconRadio * 0.533}
                    eventHandlers={{ click: clickMasterDeviceHandler }}
                >
                    <Tooltip sticky>
                        <span style={{ fontWeight: 'bold' }}>Device</span><br />
                        Name: {deviceData.name}<br />
                        Type: {deviceData.type}<br />
                        Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </Tooltip>
                </Circle >

            }
        </>
    )
}

export default GeoMasterDevice;