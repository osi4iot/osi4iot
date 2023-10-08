import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';

interface MobileSVGOverlayProps {
    fillColor: string;
    bounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}


export const MobileSVGOverlay: FC<MobileSVGOverlayProps> = ({
    fillColor,
    bounds,
    imageRef = null
}) => {
    return (
        <SVGOverlay ref={imageRef as any} attributes={{ viewBox: "0 0 16 16", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
            <path d="M11.5 0h-7c-0.825 0-1.5 0.675-1.5 1.5v13c0 0.825 0.675 1.5 1.5 1.5h7c0.825 0 1.5-0.675 1.5-1.5v-13c0-0.825-0.675-1.5-1.5-1.5zM6 0.75h4v0.5h-4v-0.5zM8 15c-0.552 0-1-0.448-1-1s0.448-1 1-1 1 0.448 1 1-0.448 1-1 1zM12 12h-8v-10h8v10z" />
        </SVGOverlay >

    )
};