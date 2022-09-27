import { FC, useEffect, useMemo } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import { NodeRedInstanceSvgImage } from "./NodeRedInstanceSvgImaga";
import { INodeRedInstance } from "../TableColumns/nodeRedInstancesInOrgsColumns";



interface GeoNodeRedInstanceProps {
    nriData: INodeRedInstance;
}

const deviceRadio = 0.0006;
const circleRadio = 0.0020;
const domainName = getDomainName();
const protocol = getProtocol();

const GeoNodeRedInstance: FC<GeoNodeRedInstanceProps> = ({
    nriData,
}) => {
    const { accessToken } = useAuthState();
    const map = useMap();

    const bounds = useMemo(() => calcGeoBounds(nriData.longitude, nriData.latitude, 2.5 * deviceRadio), [nriData]);
    const outerBounds = useMemo(() => calcGeoBounds(nriData.longitude, nriData.latitude, circleRadio), [nriData]);


    const clickNodeRedInstanceHandler = () => {
        if (nriData.nriHash) {
            map.fitBounds(outerBounds as LatLngTuple[]);
            let urlMasterDevice = `${protocol}://${domainName}/nodered_${nriData.nriHash}/?access_token=${accessToken}`;
            setTimeout(() => window.open(urlMasterDevice, "_blank"), 250);
        } else {
            toast.warning("Master device hash is null");
        }
    }


    return (
        <>
            <Circle
                center={[nriData.latitude, nriData.longitude]}
                pathOptions={{ color: "#363632", fillColor: "#363632", fillOpacity: 1 }}
                radius={1.5}
                eventHandlers={{ click: clickNodeRedInstanceHandler }}
            >
                <NodeRedInstanceSvgImage
                    bounds={bounds as LatLngTuple[]}
                    instanceNumber={nriData.instanceNumber}
                    clickNodeRedInstanceHandler={clickNodeRedInstanceHandler}
                />
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Node-RED instance {nriData.instanceNumber}</span><br />
                </Tooltip>
            </Circle >
        </>

    )
}

export default GeoNodeRedInstance;