import { FC, useEffect, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwinState } from "./GeolocationContainer";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import { MaterialDeviceSvgImage } from "./MaterialDeviceSvgImage";


const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

const setDeviceCircleColor = (deviceId: number, deviceSelected: IDevice | null): string => {
    let color = NON_SELECTED;
    if (deviceSelected && deviceId === deviceSelected.id) {
        return SELECTED;
    }
    return color;
}

const setMasterDeviceCircleColor = (
    deviceId: number,
    deviceSelected: IDevice | null,
    masterDeviceSelected: IDevice | null
): string => {
    let color = NON_SELECTED;
    if (deviceSelected && deviceId === deviceSelected.id && masterDeviceSelected && deviceId === masterDeviceSelected.id) {
        return SELECTED;
    }
    return color;
}


interface GeoMasterDeviceProps {
    deviceData: IDevice;
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    masterDeviceSelected: IDevice | null;
    selectMasterDevice: (masterDeviceSelected: IDevice | null) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const deviceRadio = 0.0006;
const circleRadio = 0.0020;
const domainName = getDomainName();
const protocol = getProtocol();

const GeoMasterDevice: FC<GeoMasterDeviceProps> = ({
    deviceData,
    deviceSelected,
    masterDeviceSelected,
    selectMasterDevice,
    selectDevice,
    digitalTwinsState
}) => {
    const { accessToken } = useAuthState();
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

    const clickMasterDeviceHandler = () => {
        selectMasterDevice(deviceData);
        if (deviceData.masterDeviceHash) {
            let urlMasterDevice = `${protocol}://${domainName}/master_device_${deviceData.masterDeviceHash}/?access_token=${accessToken}`;
            window.open(urlMasterDevice, "_blank");
        } else {
            toast.warning("Master device hash is null");
        }
    }

    useEffect(() => {
        if (deviceSelected?.id === deviceData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [deviceSelected, deviceData.id, outerBounds, map]);

    return (
        <>
            <Circle
                center={[deviceData.latitude, deviceData.longitude]}
                pathOptions={{ color: setDeviceCircleColor(deviceData.id, deviceSelected), fillColor: "#555555", fillOpacity: 1 }}
                radius={1.5}
                eventHandlers={{ click: clickHandler }}
            >
                {
                    status === "ok" &&
                    <MaterialDeviceSvgImage
                        fillColor={STATUS_OK}
                        bounds={bounds as LatLngTuple[]}
                        deviceType={deviceData.type}
                    />
                }
                {
                    status === "pending" &&
                    <MaterialDeviceSvgImage
                        fillColor={STATUS_PENDING}
                        bounds={bounds as LatLngTuple[]}
                        deviceType={deviceData.type}
                    />
                }
                {
                    status === "alerting" &&
                    <MaterialDeviceSvgImage
                        fillColor={STATUS_ALERTING}
                        bounds={bounds as LatLngTuple[]}
                        deviceType={deviceData.type}
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
                    pathOptions={{ color: setMasterDeviceCircleColor(deviceData.id, deviceSelected, masterDeviceSelected), fillColor: "#555555", fillOpacity: 1 }}
                    radius={0.8}
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