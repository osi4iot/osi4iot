import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';

interface EolicTowerSVGOverlayProps {
    fillColor: string;
    bounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}


export const EolicTowerSVGOverlay: FC<EolicTowerSVGOverlayProps> = ({
    fillColor,
    bounds,
    imageRef = null
}) => {
    return (
        <SVGOverlay ref={imageRef as any} attributes={{ viewBox: "0 0 236.66 342.39", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
            <g id="Layer_3" data-name="Layer 3"><path d="M88.8,311.75H148a30.64,30.64,0,0,1,30.64,30.64v0a0,0,0,0,1,0,0H58.16a0,0,0,0,1,0,0v0A30.64,30.64,0,0,1,88.8,311.75Z" /><path d="M245.45,72.32c.2-4.41,5.28-10,9.69-10h0c4.11,0,8.43,5.42,8.85,9.51l6.68,87.79a1.09,1.09,0,0,1-1.63,1.06c-11.47-6.23-23.58-1.73-27.88.28a1.1,1.1,0,0,1-1.55-1Z" transform="translate(-137.58 -62.28)" /><path d="M367.77,218.6c4.07,1.7,7.62,8.4,6.12,12.55-.08.19.09-.27,0,0-1.41,3.86-8,6.07-12,5.06l-84.78-23.75a1.1,1.1,0,0,1-.44-1.89c9.78-8.65,9.69-21.57,9.28-26.3a1.08,1.08,0,0,1,1.51-1.09Z" transform="translate(-137.58 -62.28)" /><path d="M150.64,236.44c-4.21,1.32-11.24-1.53-12.75-5.68h0c-1.41-3.86,2.21-9.78,5.91-11.56L224,182.89a1.1,1.1,0,0,1,1.56,1.17c-1.94,12.91,6.43,22.75,9.79,26.1a1.09,1.09,0,0,1-.45,1.81Z" transform="translate(-137.58 -62.28)" /></g><g id="Body"><path d="M246.19,219.17,239.91,367.9a1.3,1.3,0,0,0,1.29,1.35h31.59a1.29,1.29,0,0,0,1.29-1.36L266.65,219.1a2.14,2.14,0,0,0-2.7-2c-1.89.52-4.61,1.75-7.52,1.75h0c-2.93,0-5.68-1.2-7.56-1.69A2.14,2.14,0,0,0,246.19,219.17Z" transform="translate(-137.58 -62.28)" /><circle cx="118.42" cy="125.72" r="24.27" /></g>
        </SVGOverlay >
    )
};