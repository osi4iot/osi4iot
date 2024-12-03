import { FC, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { getDomainName, getProtocol, openWindowTab } from "../../../tools/tools";
import { useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import { NodeRedInstanceSvgImage } from "./NodeRedInstanceSvgImage";
import { setWindowObjectReferences, usePlatformAssitantDispatch, useWindowObjectReferences } from "../../../contexts/platformAssistantContext";


interface GeoNodeRedInstanceProps {
    longitude: number;
    latitude: number;
    iconRadio: number;
    nriHash: string;
    linkAvailable?: boolean;
}


const domainName = getDomainName();
const protocol = getProtocol();

const GeoNodeRedInstance: FC<GeoNodeRedInstanceProps> = ({
    longitude,
    latitude,
    iconRadio,
    nriHash,
    linkAvailable = true
}) => {
    const { accessToken } = useAuthState();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const windowObjectReferences = useWindowObjectReferences();
    const map = useMap();

    const bounds = useMemo(() => calcGeoBounds(longitude, latitude, 0.00095 * iconRadio), [longitude, latitude, iconRadio]);
    const outerBounds = useMemo(() => calcGeoBounds(longitude, latitude, 0.002 * iconRadio), [longitude, latitude, iconRadio]);


    const clickNodeRedInstanceHandler = () => {
        if (linkAvailable) {
            if (nriHash) {
                map.fitBounds(outerBounds as LatLngTuple[]);
                let urlNodeRedInstance = `${protocol}://${domainName}/nodered_${nriHash}/?access_token=${accessToken}`;
                setTimeout(() =>
                    openWindowTab(
                        urlNodeRedInstance,
                        plaformAssistantDispatch,
                        windowObjectReferences,
                        setWindowObjectReferences
                    ), 250);
            } else {
                toast.warning("Nodered instance hash is null");
            }
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