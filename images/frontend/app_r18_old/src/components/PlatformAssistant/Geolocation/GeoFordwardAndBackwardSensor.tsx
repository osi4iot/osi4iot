import { FC, useEffect, useMemo, useState } from "react";
import { Circle } from 'react-leaflet';
import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';
import { LatLngTuple } from 'leaflet';
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { IAsset } from "../TableColumns/assetsColumns";
import { FordwardAndBackwardSensorSvgImage } from "./FordwardAndBackwardSensorSvgImage";

const INACTIVE = "#4f6378";
const ACTIVE = "#0202d1";
const HOVER = "#0000FF";

interface GeoFordwardAndBackwardSensorProps {
    clickHandler: () => void;
    posAngle: number;
    iconAngle: number;
    assetData: IAsset;
    buttonActive: boolean,
}

const calcGeoPointPosition = (pointLongitude: number, pointLatitude: number, distance: number, angle: number): number[] => {
    const pt = point([pointLongitude, pointLatitude]);
    let bearing: number = angle;
    const position = rhumbDestination(pt, distance, bearing);
    return [position.geometry.coordinates[0], position.geometry.coordinates[1]];
}

const GeoFordwardAndBackwardSensor: FC<GeoFordwardAndBackwardSensorProps> = ({
    clickHandler,
    posAngle,
    iconAngle,
    assetData,
    buttonActive
}) => {
    const positionRadius = 0.00076 * assetData.iconRadio;
    const [centerLongitude, centerLatitude] = calcGeoPointPosition(assetData.longitude, assetData.latitude, positionRadius, posAngle);
    const [fillColor, setFillColor] = useState(INACTIVE);
    const [buttonHover, setButtonHover ]= useState(false);

    useEffect(() => {
        if (buttonActive) setFillColor(ACTIVE)
        else setFillColor(INACTIVE);
    }, [buttonActive]);

    const sensorRadio = 0.00010 * assetData.iconRadio;
    const boundsSensor = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            sensorRadio
        ), [centerLongitude, centerLatitude, sensorRadio]);

    const sensorOuterRadio = 0.00014 * assetData.iconRadio;
    const outerBoundsSensor = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            sensorOuterRadio
        ), [centerLongitude, centerLatitude, sensorOuterRadio]);

    const mouseoverHandller = () => {
        if (buttonActive) {
            setButtonHover(true);
            setFillColor(HOVER);
        }
    }

    const mouseoutHandler = () => {
        setButtonHover(false);
        if (buttonActive) {
            setFillColor(ACTIVE);
        }  else setFillColor(INACTIVE);
    }

    return (
        <Circle
            center={[centerLatitude, centerLongitude]}
            pathOptions={{ stroke: false, fillOpacity: 0 }}
            radius={0.1666 * assetData.iconRadio}
            eventHandlers={{ click: clickHandler, mouseover: mouseoverHandller, mouseout: mouseoutHandler }}
        >
            <FordwardAndBackwardSensorSvgImage
                key={`${fillColor}-${iconAngle}`}
                buttonHover={buttonHover}
                iconAngle={iconAngle}
                fillColor={fillColor}
                bounds={boundsSensor as LatLngTuple[]}
                outerBounds={outerBoundsSensor as LatLngTuple[]}
            />
        </Circle >
    )
}

export default GeoFordwardAndBackwardSensor;