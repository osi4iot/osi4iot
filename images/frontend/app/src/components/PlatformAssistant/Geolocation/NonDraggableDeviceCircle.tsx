import { FC, useMemo } from 'react'
import 'leaflet/dist/leaflet.css';
import { Circle } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { IDevice } from '../TableColumns/devicesColumns';
import calcGeoBounds from '../../../tools/calcGeoBounds';
import { DeviceSvgImage } from './DeviceSvgImage';
import { MaterialDeviceSvgImage } from './MaterialDeviceSvgImage';


const NORMAL = "#9c9a9a";
const DEVICE_COLOR = "#e0e0dc";

interface NonDraggableDeviceCircleProps {
    device: IDevice;
}


const NonDraggableDeviceCircle: FC<NonDraggableDeviceCircleProps> = ({ device }) => {
    const devicePosition = [device.latitude, device.longitude];

    const outerBounds = useMemo(() => calcGeoBounds(device.longitude, device.latitude, device.iconRadio * 0.001), [device]);
    const bounds = useMemo(() => calcGeoBounds(device.longitude, device.latitude, device.iconRadio * 0.0004), [device]);

    return (
        <>
            <Circle
                center={devicePosition as LatLngTuple}
                pathOptions={{ color: NORMAL, fillColor: "#555555", fillOpacity: 0.5 }}
                radius={device.iconRadio}
            >
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Device</span><br />
                    Name: {`Device_${device.deviceUid}`}<br />
                </Tooltip>
            </Circle>
            {
                device.type === "Master" ?
                    <MaterialDeviceSvgImage
                        deviceId={device.id}
                        deviceSelected={null}
                        fillColor={DEVICE_COLOR}
                        bounds={bounds as LatLngTuple[]}
                        outerBounds={outerBounds as LatLngTuple[]}
                    />
                    :
                    <DeviceSvgImage
                        deviceId={device.id}
                        deviceSelected={null}
                        fillColor={DEVICE_COLOR}
                        bounds={bounds as LatLngTuple[]}
                        outerBounds={outerBounds as LatLngTuple[]}
                    />
            }
        </>
    )
};


export default NonDraggableDeviceCircle;