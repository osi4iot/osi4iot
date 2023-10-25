import { FC, useEffect, useRef } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';


interface CustomSVGOverlayProps {
    fillColor: string;
    bounds: LatLngTuple[];
    svgString: string;
    imageRef: React.MutableRefObject<undefined> | null;
}

export const CustomSVGOverlay: FC<CustomSVGOverlayProps> = ({
    fillColor,
    bounds,
    svgString,
    imageRef = null
}) => {
    const svgRef = useRef(null);

    useEffect(() => {
        if (svgRef.current) {
            (svgRef.current as any).innerHTML = svgString;
        }
    }, [svgString]);

    return (
        <SVGOverlay ref={imageRef as any} attributes={{ fill: fillColor }} bounds={bounds as LatLngTuple[]}>
            <g ref={svgRef} />
        </SVGOverlay >
    )
};