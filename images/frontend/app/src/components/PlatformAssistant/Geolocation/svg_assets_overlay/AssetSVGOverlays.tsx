import { FC } from "react";
import { LatLngTuple } from 'leaflet';
import { GenericAssetSVGOverlay } from "./GenericAssetSVGOverlay";
import { MobileSVGOverlay } from "./MobileSVGOverlay";
import { WindTurbineSVGOverlay } from "./WindTurbineSVGOverlay";
import { MachineSVGOverlay } from "./MachineSVGOverlay";


interface AssetSVGOverlaysProps {
    assetType: string,
    fillColor: string;
    bounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}

export const AssetSVGOverlays: FC<AssetSVGOverlaysProps> = ({
    assetType,
    fillColor,
    bounds,
    imageRef = null
}) => {
    switch (assetType) {
        case 'mobile':
            return <MobileSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
        case 'wind_turbine':
            return <WindTurbineSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
        case 'machine':
            return <MachineSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
        // .. etc
        default:
            return <GenericAssetSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
    }
};