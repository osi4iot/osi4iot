import { FC } from "react";
import { LatLngTuple } from 'leaflet';
import { GenericAssetSVGOverlay } from "./GenericAssetSVGOverlay";
import { MobileSVGOverlay } from "./MobileSVGOverlay";
import { EolicTowerSVGOverlay } from "./EolicTowerSVGOverlay";
import { MachineSVGOverlay } from "./MachineSVGOverlay";
import { CarSVGOverlay } from "./CarSVGOverlay";
import { TruckSVGOverlay } from "./TruckSVGOverlay";
import { ShipSVGOverlay } from "./ShipSVGOverlay";


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
        case 'car':
            return <CarSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
        case 'eolic_tower':
            return <EolicTowerSVGOverlay
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
        case 'mobile':
            return <MobileSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
        case 'ship':
            return <ShipSVGOverlay
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                imageRef={imageRef}
            />;
        case 'truck':
            return <TruckSVGOverlay
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