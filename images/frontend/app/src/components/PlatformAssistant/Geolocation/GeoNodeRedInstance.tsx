import { FC, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import { NodeRedInstanceSvgImage } from "./NodeRedInstanceSvgImage";
import { INodeRedInstance } from "../TableColumns/nodeRedInstancesInOrgsColumns";



interface GeoNodeRedInstanceProps {
    nriData: INodeRedInstance;
    instanceNumber: number;
}

const deviceRadio = 0.0006;
const circleRadio = 0.0020;
const domainName = getDomainName();
const protocol = getProtocol();

const GeoNodeRedInstance: FC<GeoNodeRedInstanceProps> = ({
    nriData,
    instanceNumber
}) => {
    const { accessToken } = useAuthState();
    const map = useMap();

    const bounds = useMemo(() => calcGeoBounds(nriData.longitude, nriData.latitude, 2.5 * deviceRadio), [nriData]);
    const outerBounds = useMemo(() => calcGeoBounds(nriData.longitude, nriData.latitude, circleRadio), [nriData]);


    const clickNodeRedInstanceHandler = () => {
        if (nriData.nriHash) {
            map.fitBounds(outerBounds as LatLngTuple[]);
            let urlNodeRedInstance = `${protocol}://${domainName}/nodered_${nriData.nriHash}/?access_token=${accessToken}`;
            setTimeout(() => window.open(urlNodeRedInstance, "_blank"), 250);
        } else {
            toast.warning("Master device hash is null");
        }
    }


    return (
        <>
            <Circle
                center={[nriData.latitude, nriData.longitude]}
                pathOptions={{ color: "#363632", fillColor: "#363632", fillOpacity: 0 }}
                radius={1.5}
                eventHandlers={{ click: clickNodeRedInstanceHandler }}
            >
                <NodeRedInstanceSvgImage
                    bounds={bounds as LatLngTuple[]}
                    instanceNumber={instanceNumber}
                    clickNodeRedInstanceHandler={clickNodeRedInstanceHandler}
                />
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Node-RED instance {instanceNumber}</span><br />
                </Tooltip>
            </Circle >
        </>

    )
}

export default GeoNodeRedInstance;