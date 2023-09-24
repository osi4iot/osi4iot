import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { ISensor } from "../TableColumns/sensorsColumns";

const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

export const setSensorCircleColor = (sensorId: number, sensorSelected: ISensor | null): string => {
    let color = NON_SELECTED;
    if (sensorSelected && sensorId === sensorSelected.id) {
        return SELECTED;
    }
    return color;
}

interface SensorSvgImageProps {
    sensorLabel: string,
    sensorId: number,
    sensorSelected: ISensor | null,
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
}


export const SensorSvgImage: FC<SensorSvgImageProps> = ({
    sensorLabel,
    sensorId,
    sensorSelected,
    fillColor,
    bounds,
    outerBounds
}) => {
    const labelPos = 36 - 3 * sensorLabel.length;
    return (
        <>
            <SVGOverlay attributes={{ viewBox: "0 0 600 600", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <circle
                    fill="#555555"
                    stroke={setSensorCircleColor(sensorId, sensorSelected)}
                    stroke-width="5"
                    cx="300"
                    cy="300"
                    r="290"
                />
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 70 70", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <text x={labelPos} y="18">{sensorLabel}</text>
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 24 24", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path d="M7.76,16.24C6.67,15.16,6,13.66,6,12s0.67-3.16,1.76-4.24l1.42,1.42C8.45,9.9,8,10.9,8,12c0,1.1,0.45,2.1,1.17,2.83 L7.76,16.24z M16.24,16.24C17.33,15.16,18,13.66,18,12s-0.67-3.16-1.76-4.24l-1.42,1.42C15.55,9.9,16,10.9,16,12 c0,1.1-0.45,2.1-1.17,2.83L16.24,16.24z M12,10c-1.1,0-2,0.9-2,2s0.9,2,2,2s2-0.9,2-2S13.1,10,12,10z M20,12 c0,2.21-0.9,4.21-2.35,5.65l1.42,1.42C20.88,17.26,22,14.76,22,12s-1.12-5.26-2.93-7.07l-1.42,1.42C19.1,7.79,20,9.79,20,12z M6.35,6.35L4.93,4.93C3.12,6.74,2,9.24,2,12s1.12,5.26,2.93,7.07l1.42-1.42C4.9,16.21,4,14.21,4,12S4.9,7.79,6.35,6.35z" />
            </SVGOverlay >
        </>
    )
};