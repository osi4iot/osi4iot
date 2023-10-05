import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import { IAsset } from "../TableColumns/assetsColumns";

const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

export const setAssetCircleColor = (assetId: number, assetSelected: IAsset | null): string => {
    let color = NON_SELECTED;
    if (assetSelected && assetId === assetSelected.id) {
        return SELECTED;
    }
    return color;
}

interface MobileAssetSvgImageProps {
    assetId: number,
    assetSelected: IAsset | null,
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
}


export const MobileAssetSvgImage: FC<MobileAssetSvgImageProps> = ({
    assetId,
    assetSelected,
    fillColor,
    bounds,
    outerBounds
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
            <SVGOverlay attributes={{ viewBox: "0 0 16 16", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path d="M11.5 0h-7c-0.825 0-1.5 0.675-1.5 1.5v13c0 0.825 0.675 1.5 1.5 1.5h7c0.825 0 1.5-0.675 1.5-1.5v-13c0-0.825-0.675-1.5-1.5-1.5zM6 0.75h4v0.5h-4v-0.5zM8 15c-0.552 0-1-0.448-1-1s0.448-1 1-1 1 0.448 1 1-0.448 1-1 1zM12 12h-8v-10h8v10z" />
            </SVGOverlay >
        </>
    )
};