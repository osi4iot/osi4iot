import { FC } from "react";
import { SVGOverlay } from 'react-leaflet';
import { LatLngTuple } from 'leaflet';

interface MachineSVGOverlayProps {
    fillColor: string;
    bounds: LatLngTuple[];
    imageRef: React.MutableRefObject<undefined> | null;
}


export const MachineSVGOverlay: FC<MachineSVGOverlayProps> = ({
    fillColor,
    bounds,
    imageRef = null
}) => {
    return (
        <SVGOverlay ref={imageRef as any} attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
            <g id="Engranaje" transform="matrix(1.4960441,0,0,1.4960441,-140.77731,-135.60375)">
                <polygon
                    points="190,257.2 199,259.6 204.3,275 225.7,274.2 228.9,259 238.7,255.2 250,266.6 268.8,255.7 263.2,239.2 271,232.3 286.5,236.6 297,217.1 284.5,206 286.6,195.8 302.3,191.7 301.5,170.3 285.2,167.4 282.4,157.3 293.9,146 281.9,127.5 266.5,132.8 258.5,125.3 262.9,109.7 244.7,100.1 233.3,111.5 223.2,109.4 217.9,94 197.7,94.5 193.7,111.1 184.7,113.5 172.2,102.4 154.9,114.1 159.8,128.4 152.3,136.3 137.1,133.1 126.3,151.6 137.4,161.8 136.4,171.7 121,176.9 120.7,198.6 137.3,202.6 140.8,211.3 128.6,224.1 140.3,241.4 155.7,236.2 162.6,244 159.1,258.1 177.8,270 "
                    id="polygon885" />
                <circle
                    cx="215.5"
                    cy="184.5"
                    r="38.299999"
                    id="circle887"
                    fill="#555555" />
                <polygon
                    points="284.7,329.8 289.2,336.4 284,349.4 298.5,360.9 309.1,352.7 317.7,355.7 318.7,369.6 337.1,372.9 342.8,359 351.7,358.9 359.4,370.4 377.2,363.5 375.3,349.3 382.4,343.8 395,349.9 406.4,335.4 397.3,324.3 401.2,316.1 415.1,315.2 417.6,296.4 404.5,291.1 403.5,281.8 415,274 408.6,257.6 394.7,258.6 389.3,251.5 394.5,238.5 380.9,227.5 369,236.1 361.8,232.6 359.8,218.4 341.9,216.3 337.1,228.5 327.7,229.5 319.6,218.9 302.2,224.9 303.7,237.8 297.5,243.7 284.5,238.5 272.1,252.5 280.8,264.5 278.2,272.1 263,273.7 261,291.6 274,296.8 274.1,305.7 263.9,313 269.5,331.3 "
                    id="polygon889" />
                <circle
                    cx="335"
                    cy="295.10001"
                    r="33"
                    id="circle891"
                    fill="#555555" />
                <polygon
                    points="132.4,370.7 135.1,378.1 126.8,389 137.8,403.5 150,398.5 157.4,403.5 154.9,416.8 171.6,424.7 180.5,413 189.1,415.2 193.6,428 212.3,426 214.1,412.1 222.2,408.8 232.7,417.7 247.3,407.1 241.5,394.4 247.2,387.6 260.8,390.3 267.9,373.2 256.7,365 258.1,355.9 271.1,351.6 269.1,334.4 255.6,331.9 252.2,323.9 260.4,312.9 250.3,299.1 236.7,304.2 230.7,299.1 232.4,285.1 215.8,278.7 208.2,288.8 198.9,287.4 193.8,275.3 175.7,276.5 173.8,289.1 166.4,293.1 155.3,284.8 140,294.9 145.2,308.3 140.8,314.8 125.9,312.4 119.4,328.7 130.6,336.9 128.4,345.4 116.8,349.6 117.5,368.2 "
                    id="polygon893" />
                <ellipse
                    transform="matrix(0.1383,-0.9904,0.9904,0.1383,-180.7908,495.0229)"
                    cx="194.10001"
                    cy="351.39999"
                    rx="32.099998"
                    ry="32.599998"
                    id="ellipse895"
                    fill="#555555"
                />
            </g>
        </SVGOverlay >
    )
};