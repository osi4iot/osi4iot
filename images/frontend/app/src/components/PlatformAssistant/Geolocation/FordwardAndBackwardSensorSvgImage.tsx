import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { ISensor } from "../TableColumns/sensorsColumns";

const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";
const HOVER = "#0000FF";

export const setSensorCircleColor = (sensorId: number, sensorSelected: ISensor | null): string => {
    let color = NON_SELECTED;
    if (sensorSelected && sensorId === sensorSelected.id) {
        return SELECTED;
    }
    return color;
}

interface FordwardAndBackwardSensorSvgImageProps {
    buttonHover: boolean;
    iconAngle: number;
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
}


export const FordwardAndBackwardSensorSvgImage: FC<FordwardAndBackwardSensorSvgImageProps> = ({
    buttonHover,
    iconAngle,
    fillColor,
    bounds,
    outerBounds
}) => {
    return (
        <>
            <SVGOverlay attributes={{ viewBox: "0 0 600 600", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <circle
                    fill="#555555"
                    stroke={buttonHover ? HOVER : NON_SELECTED}
                    strokeWidth={buttonHover ? 15 : 5}
                    cx="300"
                    cy="300"
                    r="290"
                />
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 24 24", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path transform={`rotate(${iconAngle}, 12, 12)`} d="M8 11.3333L18.2227 4.51823C18.4524 4.36506 18.7628 4.42714 18.916 4.65691C18.9708 4.73904 19 4.83555 19 4.93426V19.0657C19 19.3419 18.7761 19.5657 18.5 19.5657C18.4013 19.5657 18.3048 19.5365 18.2227 19.4818L8 12.6667V19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19V5C6 4.44772 6.44772 4 7 4C7.55228 4 8 4.44772 8 5V11.3333Z" />
            </SVGOverlay >
        </>
    )
};