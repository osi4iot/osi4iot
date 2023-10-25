import { FC, useEffect, useRef } from "react";
import styled from "styled-components";

interface ImagetStyledProps {
    imgWidth: string;
    imgHeight: string;
    fillColor: string;
    backgroundColor: string;
}

const ImagetStyled = styled.div<ImagetStyledProps>`
    & svg {
        width: ${(props) => `${props.imgWidth}px !important`};
        height: ${(props) => `${props.imgHeight}px !important`};
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

interface SvgComponentProps {
    svgString: string;
    imgWidth: string;
    imgHeight: string;
    backgroundColor: string;
    fillColor?: string;
}

const SvgComponent: FC<SvgComponentProps> = ({
    svgString,
    imgWidth,
    imgHeight,
    backgroundColor,
    fillColor = "#62f700",
}) => {
    const svgRef = useRef(null);
    
    useEffect(() => {
        if (svgRef.current) {
            (svgRef.current as any).innerHTML = svgString;
        }
    }, [svgString]);

    return (
        <ImagetStyled
            ref={svgRef}
            imgWidth={imgWidth}
            imgHeight={imgHeight}
            backgroundColor={backgroundColor}
            fillColor={fillColor}
        />
    )

}

export default SvgComponent;