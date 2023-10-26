import { FC } from "react";
import { LatLngTuple } from 'leaflet';
import { CustomSVGOverlay } from "./CustomSVGOverlay";

interface AssetSVGOverlaysProps {
    iconSvgString: string,
    fillColor: string;
    bounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}

export const AssetSVGOverlays: FC<AssetSVGOverlaysProps> = ({
    iconSvgString,
    fillColor,
    bounds,
    imageRef = null
}) => {
    return <CustomSVGOverlay
        fillColor={fillColor}
        bounds={bounds as LatLngTuple[]}
        imageRef={imageRef}
        svgString={iconSvgString}
    />
};