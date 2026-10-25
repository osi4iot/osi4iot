import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { ISensor } from "../TableColumns/sensorsColumns";
import { ISensorType } from "../TableColumns/sensorTypesColumns";
import { CustomSVGOverlay } from "./svg_assets_overlay/CustomSVGOverlay";

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
    sensorType: ISensorType;
    sensorLabel: string,
    sensorId: number,
    sensorSelected: ISensor | null,
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
}


export const SensorSvgImage: FC<SensorSvgImageProps> = ({
    sensorType,
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
                    strokeWidth="15"
                    cx="300"
                    cy="300"
                    r="290"
                />
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 70 70", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <text x={labelPos} y="18">{sensorLabel}</text>
            </SVGOverlay >
            <CustomSVGOverlay
                svgString={sensorType.iconSvgString}
                fillColor={fillColor}
                backgroundColor="#555555"
                bounds={bounds}
                imageRef={null}
            />
        </>
    )
};