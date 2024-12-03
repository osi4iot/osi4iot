import { FC } from "react";
import { LatLngTuple } from 'leaflet';
import { CustomSVGOverlay } from "./CustomSVGOverlay";

interface AssetSVGOverlaysProps {
    iconSvgString: string,
    fillColor: string;
    backgroundColor: string;
    bounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}

export const AssetSVGOverlays: FC<AssetSVGOverlaysProps> = ({
    iconSvgString,
    fillColor,
    backgroundColor,
    bounds,
    imageRef = null
}) => {
    return <CustomSVGOverlay
        fillColor={fillColor}
        backgroundColor={backgroundColor}
        bounds={bounds as LatLngTuple[]}
        imageRef={imageRef}
        svgString={iconSvgString}
    />
};