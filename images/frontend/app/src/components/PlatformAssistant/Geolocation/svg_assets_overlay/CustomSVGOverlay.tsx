import { FC, useEffect, useRef } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';
import styled from "styled-components";

interface SVGOverlayStyledProps {
    fillColor: string;
    backgroundColor: string;
}

const SVGOverlayStyled = styled(SVGOverlay) <SVGOverlayStyledProps>`
    & svg {
        fill: ${(props) => `${props.fillColor} !important`};

        .hollow {
            fill: ${(props) => `${props.backgroundColor} !important`};
        }

        .locationPin {
            fill: ${(props) => `${props.fillColor} !important`};
        }

        .icon {
            fill: ${(props) => `${props.backgroundColor} !important`};
        }
    }
`;

interface CustomSVGOverlayProps {
    fillColor: string;
    backgroundColor: string;
    bounds: LatLngTuple[];
    svgString: string;
    imageRef: React.MutableRefObject<undefined> | null;
}

export const CustomSVGOverlay: FC<CustomSVGOverlayProps> = ({
    fillColor,
    backgroundColor,
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
        <SVGOverlayStyled
            ref={imageRef as any}
            attributes={{ fill: fillColor }}
            bounds={bounds as LatLngTuple[]}
            backgroundColor={backgroundColor}
            fillColor={fillColor}
        >
            <g ref={svgRef} />
        </SVGOverlayStyled >
    )
};