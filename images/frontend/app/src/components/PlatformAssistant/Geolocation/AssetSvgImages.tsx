import { FC } from "react";
import { LatLngTuple } from 'leaflet';
import { SVGOverlay } from 'react-leaflet';
import { IAsset } from "../TableColumns/assetsColumns";
import { CustomSVGOverlay } from "./svg_assets_overlay/CustomSVGOverlay";

const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

export const setAssetCircleColor = (assetId: number, assetSelected: IAsset | null): string => {
    let color = NON_SELECTED;
    if (assetSelected && assetId === assetSelected.id) {
        return SELECTED;
    }
    return color;
}

interface AssetSvgImagesProps {
    status: string,
    iconSvgString: string,
    assetId: number,
    assetSelected: IAsset | null,
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}

export const AssetSvgImages: FC<AssetSvgImagesProps> = ({
    status,
    iconSvgString,
    assetId,
    assetSelected,
    fillColor,
    bounds,
    outerBounds,
    imageRef = null
}) => {
    return (
        <>
            <SVGOverlay attributes={{ viewBox: "0 0 600 600", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <circle
                    fill="#555555"
                    stroke={setAssetCircleColor(assetId, assetSelected)}
                    strokeWidth="5"
                    cx="300"
                    cy="300"
                    r="290"
                />
            </SVGOverlay >
            <CustomSVGOverlay
                svgString={iconSvgString}
                fillColor={fillColor}
                backgroundColor="#555555"
                bounds={bounds}
                imageRef={imageRef}
            />
        </>
    )
};