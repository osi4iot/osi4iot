import { FC, useEffect, useMemo, useState } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwinState } from "./GeolocationContainer";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { DeviceSvgImage } from "./DeviceSvgImage";
import GeoDigitalTwins from "./GeoDigitalTwins";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";


interface GeoDeviceProps {
    deviceData: IDevice;
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}

const GeoDevice: FC<GeoDeviceProps> = ({
    deviceData,
    deviceSelected,
    selectDevice,
    digitalTwins,
    digitalTwinSelected,
    selectDigitalTwin,
    digitalTwinsState,
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    const [status, setStatus] = useState("unknown");
    const [fillColor, setFillColor] = useState(STATUS_OK);
    const map = useMap();
    const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);

    useEffect(() => {
        const devicesStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.deviceId === deviceData.id);
        const status = findOutStatus(devicesStateFiltered);
        setStatus(status);
        if (status === "ok") setFillColor(STATUS_OK)
        else if (status === "pending") setFillColor(STATUS_PENDING)
        else if (status === "alerting") setFillColor(STATUS_ALERTING);
    }, [deviceData, digitalTwinsState]);

    const outerBounds = useMemo(() => calcGeoBounds(deviceData.longitude, deviceData.latitude, deviceData.iconRadio * 0.001), [deviceData]);
    const bounds = useMemo(() => calcGeoBounds(deviceData.longitude, deviceData.latitude, deviceData.iconRadio * 0.0004), [deviceData]);

    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
        selectDevice(deviceData);
    }

    useEffect(() => {
        if (deviceSelected?.id === deviceData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [deviceSelected, deviceData, outerBounds, map]);

    return (
        <Circle
            center={[deviceData.latitude, deviceData.longitude]}
            pathOptions={{ stroke: false, fillOpacity: 0 }}
            radius={deviceData.iconRadio}
            eventHandlers={{ click: clickHandler }}
        >
            <DeviceSvgImage
                key={status}
                deviceId={deviceData.id}
                deviceSelected={deviceSelected as IDevice}
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
            />
            <Tooltip sticky>
                <span style={{ fontWeight: 'bold' }}>Device</span><br />
                Name: {`Device_${deviceData.deviceUid}`}<br />
                Type: {deviceData.type}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </Tooltip>
            {
                deviceSelected &&
                <GeoDigitalTwins
                    key={status}
                    deviceSelected={deviceSelected}
                    digitalTwins={digitalTwinsFiltered}
                    digitalTwinSelected={digitalTwinSelected}
                    selectDigitalTwin={selectDigitalTwin}
                    digitalTwinsState={digitalTwinsState}
                    openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                    setGlftDataLoading={setGlftDataLoading}
                />
            }
        </Circle >
    )
}

export default GeoDevice;