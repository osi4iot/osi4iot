import { FC } from "react";
import { LatLngTuple } from 'leaflet';
import { IAsset } from "../TableColumns/assetsColumns";
import { MobileAssetSvgImage } from "./MobileAssetImage";
import { GenericAssetSvgImage } from "./GenericAssetSvgImage";



interface AssetSvgImagesProps {
    status: string,
    assetType: string,
    assetId: number,
    assetSelected: IAsset | null,
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
}

export const AssetSvgImages: FC<AssetSvgImagesProps> = ({
    status,
    assetType,
    assetId,
    assetSelected,
    fillColor,
    bounds,
    outerBounds
}) => {
    switch (assetType) {
        case 'mobile':
            return <MobileAssetSvgImage
                key={status}
                assetId={assetId}
                assetSelected={assetSelected as IAsset}
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
            />;
        case 'generic':
            return <GenericAssetSvgImage
                key={status}
                assetId={assetId}
                assetSelected={assetSelected as IAsset}
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
            />;
        // .. etc
        default:
            return <GenericAssetSvgImage
                key={status}
                assetId={assetId}
                assetSelected={assetSelected as IAsset}
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
            />;
    }
};