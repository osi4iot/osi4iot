import { FC, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import { NodeRedInstanceSvgImage } from "./NodeRedInstanceSvgImage";


interface GeoNodeRedInstanceProps {
    longitude: number;
    latitude: number;
    iconRadio: number;
    nriHash:string
}

// const deviceRadio = 0.0006;
// const circleRadio = 0.0020;
const domainName = getDomainName();
const protocol = getProtocol();

const GeoNodeRedInstance: FC<GeoNodeRedInstanceProps> = ({
    longitude,
    latitude,
    iconRadio,
    nriHash
}) => {
    const { accessToken } = useAuthState();
    const map = useMap();

    const bounds = useMemo(() => calcGeoBounds(longitude, latitude, 0.0011 * iconRadio), [longitude, latitude, iconRadio]);
    const outerBounds = useMemo(() => calcGeoBounds(longitude, latitude, 0.002 * iconRadio), [longitude, latitude, iconRadio]);


    const clickNodeRedInstanceHandler = () => {
        if (nriHash) {
            map.fitBounds(outerBounds as LatLngTuple[]);
            let urlNodeRedInstance = `${protocol}://${domainName}/nodered_${nriHash}/?access_token=${accessToken}`;
            setTimeout(() => window.open(urlNodeRedInstance, "_blank"), 250);
        } else {
            toast.warning("Master device hash is null");
        }
    }


    return (
        <>
            <Circle
                center={[latitude, longitude]}
                pathOptions={{ stroke: false, fillOpacity: 0 }}
                radius={iconRadio}
                eventHandlers={{ click: clickNodeRedInstanceHandler }}
            >
                <NodeRedInstanceSvgImage
                    bounds={bounds as LatLngTuple[]}
                    clickNodeRedInstanceHandler={clickNodeRedInstanceHandler}
                />
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Node-RED instance</span><br />
                </Tooltip>
            </Circle >
        </>

    )
}

export default GeoNodeRedInstance;