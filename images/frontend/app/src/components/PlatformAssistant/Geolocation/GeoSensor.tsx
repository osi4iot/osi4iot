import { FC, useMemo, useState } from "react";
import { Circle } from 'react-leaflet';
import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { toast } from "react-toastify";
import { ISensor } from "../TableColumns/sensorsColumns";
import { IAsset } from "../TableColumns/assetsColumns";
import { SensorSvgImage } from "./SensorSvgImage";
import { STATUS_OK } from "./statusTools";


interface GeoSensorProps {
    sensorLabel: string,
    assetData: IAsset;
    sensorData: ISensor;
    sensorIndex: number;
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor) => void;
}

const calcGeoPointPosition = (pointLongitude: number, pointLatitude: number, distance: number, angle: number): number[] => {
    const pt = point([pointLongitude, pointLatitude]);
    let bearing: number = angle;
    if (angle > 180) {
        bearing = angle - 360;
    }
    const position = rhumbDestination(pt, distance, bearing);
    return [position.geometry.coordinates[0], position.geometry.coordinates[1]];
}

const GeoSensor: FC<GeoSensorProps> = ({
    sensorLabel,
    assetData,
    sensorData,
    sensorIndex,
    sensorSelected,
    selectSensor
}) => {
    const angle = 360 * sensorIndex / 12;
    const positionRadius = 0.00076 * assetData.iconRadio;
    const [centerLongitude, centerLatitude] = calcGeoPointPosition(assetData.longitude, assetData.latitude, positionRadius, angle);
    const [status, setStatus] = useState("unknown");
    const [fillColor, setFillColor] = useState(STATUS_OK);

    const sensorRadio = 0.00010 * assetData.iconRadio;
    const boundsSensor = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            sensorRadio
        ), [centerLongitude, centerLatitude, sensorRadio]);

    const sensorOuterRadio = 0.00018 * assetData.iconRadio;
    const outerBoundsSensor = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            sensorOuterRadio
        ), [centerLongitude, centerLatitude, sensorOuterRadio]);


    const clickHandler = () => {
        selectSensor(sensorData);
        const url = (sensorData.dashboardUrl as string);
        if (url.slice(0, 7) === "Warning") {
            toast.warning(url);
        } else window.open(url, "_blank");
    }

    return (
        <Circle
            center={[centerLatitude, centerLongitude]}
            pathOptions={{ stroke: false, fillOpacity: 0 }}
            radius={0.1666 * assetData.iconRadio}
            eventHandlers={{ click: clickHandler }}
        >
            <SensorSvgImage
                sensorLabel={sensorLabel}
                sensorId={sensorData.id}
                sensorSelected={sensorSelected as ISensor}
                fillColor={fillColor}
                bounds={boundsSensor as LatLngTuple[]}
                outerBounds={outerBoundsSensor as LatLngTuple[]}
            />
            <Tooltip sticky>
                <span style={{ fontWeight: 'bold' }}>Sensor</span><br />
                Name: {`Sensor_${sensorData.sensorUid}`}<br />
                Description: {sensorData.description}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </Tooltip>
        </Circle >
    )
}

export default GeoSensor;