import { FC, useEffect, useMemo, useState } from "react";
import { SVGOverlay, Circle } from 'react-leaflet';
import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { findOuDigitalTwinStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import { IDigitalTwinState } from "./GeolocationContainer";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { createUrl, IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { toast } from "react-toastify";
import { IMqttTopicData } from "../DigitalTwin3DViewer/Model";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";

const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";

const setDigitalTwinCircleColor = (digitalTwinId: number, digitalTwinSelected: IDigitalTwin | null): string => {
    let color = NON_SELECTED;
    if (digitalTwinSelected && digitalTwinId === digitalTwinSelected.id) {
        return SELECTED;
    }
    return color;
}

interface DigitanTwinSvgImageProps {
    digitalTwinId: number,
    digitalTwinSelected: IDigitalTwin,
    fillColor: string;
    bounds: LatLngTuple[];
    outerBounds: LatLngTuple[];
}

const DigitanTwinSvgImage: FC<DigitanTwinSvgImageProps> = ({
    digitalTwinId,
    digitalTwinSelected,
    fillColor,
    bounds,
    outerBounds
}) => {
    return (
        <>
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path d="M258.7,113.7c0.5,7.9-4.5,11.7-8.4,15.9c-3.3,3.5-4.7,6.7-4.1,11.8c0.9,7.7,1.1,15.7,0.1,23.4c-0.8,6.3,1.2,10.4,5.2,14.7
	c9.5,10.3,9.6,13,2.7,25c-4.6,8-9.3,15.9-13.8,23.9c-3.9,7.1-9.4,10.1-17.3,7.4c-8.2-2.8-15.6-2.3-22,4.5c-1.5,1.6-3.6,2.7-5.6,3.6
	c-11.2,4.7-21,10.4-23,24.3c-0.7,4.8-5.8,7.4-11,7.4c-12,0.1-24,0.1-36,0c-6.7,0-11.4-3.6-12.7-10c-1.9-10.1-7.4-16.2-17.1-18.9
	c-2.1-0.6-4.1-1.8-5.8-3.3c-8.9-7.6-18.2-11.7-30.2-6.9c-4.9,2-9.8-1.4-12.6-6.2C41,220,35,209.6,29.1,199.1
	c-3.4-5.9-2.4-11.7,2.5-16c7.4-6.5,10.2-13.7,7.8-23.6c-1.1-4.5-1.1-9.8,0.2-14.1c2.4-8.3-0.8-13.9-6.5-19.1
	c-6.8-6.2-7.4-13-2.4-20.9c5.4-8.5,10.2-17.3,15.1-26.1c3.9-7,9.4-10.2,17.3-7.6c8.1,2.7,15.6,2.6,22-4.3c2-2.2,4.9-3.8,7.8-4.8
	c10.5-4.1,18.7-9.6,20.6-22.2c0.8-5.5,6.1-8.4,12.1-8.4c11.7,0,23.4,0,35.1,0c8.2,0,12.1,5.2,13.7,12.2c1.7,8,5.5,13.6,13.8,15.6
	c2.4,0.6,4.7,2,6.6,3.5c9.7,7.6,19.5,13.2,32.5,7.7c3.9-1.6,8.5,1,10.8,4.8c6.8,11.2,13.3,22.6,19.8,34
	C258.7,111.3,258.6,113.2,258.7,113.7z"/>
                <path d="M375.6,160c0-24.9-0.2-49.8,0.1-74.7c0.1-5.4-1.6-6.3-6.6-6.3c-25.9,0.2-51.9,0.1-77.8,0.1c-10.3,0-16.3-4.7-16.2-12.7
	c0.1-7.9,5.9-12.5,16.4-12.5c28.5,0,56.9,0,85.4,0c15.5,0,23.8,8.2,23.8,23.7c0.1,24.9,0,49.8,0,74.7c0,2.7,0,5.3,0,8
	c0.6,0.3,1.2,0.7,1.8,1c3.5-3.8,6.7-8,10.5-11.5c5.5-5,12.4-4.7,17.3,0c4.9,4.8,5.5,12,0.4,17.3c-11.2,11.7-22.6,23.2-34.3,34.4
	c-5.5,5.2-11.9,4.8-17.2-0.4c-11.2-10.9-22.3-22-33.1-33.2c-5.5-5.7-5.3-13-0.2-18c5-5,12.2-5.1,17.9,0.4c3.6,3.4,6.6,7.4,9.8,11.1
	C374.3,161,374.9,160.5,375.6,160z"/>
                <path d="M107.7,334.1c0,25.4,0.2,50.8-0.1,76.2c-0.1,5.4,2.9,4.8,6.3,4.8c26.8,0,53.6-0.1,80.3,0c8.4,0,13.9,5.1,14,12.4
	c0.1,7.2-5.4,12.4-13.6,12.8c-0.6,0-1.1,0-1.7,0c-29.3,0-58.6,0.1-87.9,0c-13.9-0.1-22.3-8.6-22.4-22.6c-0.1-25.2,0-50.4,0-75.6
	c0-2.7,0-5.4,0-10.7c-5,5.3-8.3,9.3-12.1,12.7c-5.8,5.2-13,4.9-17.9-0.3c-4.6-5-4.8-12,0.3-17.4c11-11.5,22.3-22.8,33.7-33.8
	c5.4-5.2,11.8-5.1,17.2,0.1c11.4,11.1,22.7,22.3,33.7,33.8c5.1,5.3,4.8,12.4,0.1,17.3c-5,5.1-12.1,5.3-17.9,0
	c-3.7-3.4-6.8-7.3-10.2-10.9C108.9,333.4,108.3,333.8,107.7,334.1z"/>
                <path d="M207.3,207.1c-4.3,0.2-7.6,2.1-10.5,4.9c-7.8,7.3-16.7,13.3-27,16.3c-8.5,2.4-13.8,7-15.2,15.6c-1,6.2-4.6,7.2-10,6.7
	c-5.1-0.5-11.4,2.1-12.7-6.5c-1.3-8.5-6.4-13.5-15-15.8s-16.8-6.7-23.1-13c-7.1-7.1-14.7-10-24-6.3c-6,2.4-7.3-1.9-9-5.5
	c-2-4.2-8.1-8.1-1.6-13.5c7.5-6.2,9.3-13.9,6.6-23.3c-2.5-8.7-2.3-17.9,0.2-26.6c2.5-8.9,0.7-16.1-6.3-21.7
	c-6.3-5.1-1.6-9.1,0.7-13.5c2.2-4.2,3.8-8.5,10.4-5.9c8.3,3.2,15.4,1.2,21.9-5.4c6.7-6.8,15.2-11.5,24.4-14.1
	c8.2-2.3,13.5-6.7,14.7-15.1c1.2-8.8,7.6-6.7,13.1-7.2c5.4-0.5,8.9,0.7,9.9,6.8c1.3,8.7,6.7,13.2,15.3,15.6
	c8.9,2.4,17.2,7.1,23.7,13.6c6.7,6.7,13.9,9.1,22.6,5.7c8.6-3.3,8.3,4.8,11.4,8.5c2.9,3.5,4,7-0.5,10.6c-7.3,5.9-8.6,13.3-6.4,22.5
	c2.2,8.9,2,18.5-0.2,27.5c-2,8.1-1.1,15,5.5,20.4c4.4,3.6,5.2,7.2,1.6,12c-3.4,4.6-4.8,11.9-13.3,8.1
	C212.2,207.6,209.5,207.6,207.3,207.1z"/>
                <path fill="#555555" d="M97.3,154.1c-0.1-25.8,20.5-46.5,46.1-46.4c25.1,0.1,45.8,20.8,45.9,46c0.2,25.4-20.9,46.5-46.3,46.4
	C117.8,200,97.4,179.5,97.3,154.1z"/>
                <path fill="#555555" d="M143.2,174.9c-11.4,0-20.6-9.1-20.7-20.6c-0.2-11.9,9.1-21.4,20.8-21.4c11.3,0,20.7,9.3,21,20.6
	C164.5,165,154.7,174.9,143.2,174.9z"/>
                <path d="M465.7,324.4c0.5,7.9-4.5,11.7-8.4,15.9c-3.3,3.5-4.7,6.7-4.1,11.8c0.9,7.7,1.1,15.7,0.1,23.4c-0.8,6.3,1.2,10.4,5.2,14.7
	c9.5,10.3,9.6,13,2.7,25c-4.6,8-9.3,15.9-13.8,23.9c-3.9,7.1-9.4,10.1-17.3,7.4c-8.2-2.8-15.6-2.3-22,4.5c-1.5,1.6-3.6,2.7-5.6,3.6
	c-11.2,4.7-21,10.4-23,24.3c-0.7,4.8-5.8,7.4-11,7.4c-12,0.1-24,0.1-36,0c-6.7,0-11.4-3.6-12.7-10c-1.9-10.1-7.4-16.2-17.1-18.9
	c-2.1-0.6-4.1-1.8-5.8-3.3c-8.9-7.6-18.2-11.7-30.2-6.9c-4.9,2-9.8-1.4-12.6-6.2c-6.1-10.3-12.1-20.7-18-31.2
	c-3.4-5.9-2.4-11.7,2.5-16c7.4-6.5,10.2-13.7,7.8-23.6c-1.1-4.5-1.1-9.8,0.2-14.1c2.4-8.3-0.8-13.9-6.5-19.1
	c-6.8-6.2-7.4-13-2.4-20.9c5.4-8.5,10.2-17.3,15.1-26.1c3.9-7,9.4-10.2,17.3-7.6c8.1,2.7,15.6,2.6,22-4.3c2-2.2,4.9-3.8,7.8-4.8
	c10.5-4.1,18.7-9.6,20.6-22.2c0.8-5.5,6.1-8.4,12.1-8.4c11.7,0,23.4,0,35.1,0c8.2,0,12.1,5.2,13.7,12.2c1.7,8,5.5,13.6,13.8,15.6
	c2.4,0.6,4.7,2,6.6,3.5c9.7,7.6,19.5,13.2,32.5,7.7c3.9-1.6,8.5,1,10.8,4.8c6.8,11.2,13.3,22.6,19.8,34
	C465.7,322,465.6,323.9,465.7,324.4z"/>
                <path d="M414.3,417.8c-4.3,0.2-7.6,2.1-10.5,4.9c-7.8,7.3-16.7,13.3-27,16.3c-8.5,2.4-13.8,7-15.2,15.6c-1,6.2-4.6,7.2-10,6.7
	c-5.1-0.5-11.4,2.1-12.7-6.5c-1.3-8.5-6.4-13.5-15-15.8c-8.6-2.3-16.8-6.7-23.1-13c-7.1-7.1-14.7-10-24-6.3c-6,2.4-7.3-1.9-9-5.5
	c-2-4.2-8.1-8.1-1.6-13.5c7.5-6.2,9.3-13.9,6.6-23.3c-2.5-8.7-2.3-17.9,0.2-26.6c2.5-8.9,0.7-16.1-6.3-21.7
	c-6.3-5.1-1.6-9.1,0.7-13.5c2.2-4.2,3.8-8.5,10.4-5.9c8.3,3.2,15.4,1.2,21.9-5.4c6.7-6.8,15.2-11.5,24.4-14.1
	c8.2-2.3,13.5-6.7,14.7-15.1c1.2-8.8,7.6-6.7,13.1-7.2c5.4-0.5,8.9,0.7,9.9,6.8c1.3,8.7,6.7,13.2,15.3,15.6
	c8.9,2.4,17.2,7.1,23.7,13.6c6.7,6.7,13.9,9.1,22.6,5.7c8.6-3.3,8.3,4.8,11.4,8.5c2.9,3.5,4,7-0.5,10.6c-7.3,5.9-8.6,13.3-6.4,22.5
	c2.2,8.9,2,18.5-0.2,27.5c-2,8.1-1.1,15,5.5,20.4c4.4,3.6,5.2,7.2,1.6,12c-3.4,4.6-4.8,11.9-13.3,8.1
	C419.2,418.3,416.5,418.3,414.3,417.8z"/>
                <path fill="#555555" d="M304.3,364.8c-0.1-25.8,20.5-46.5,46.1-46.4c25.1,0.1,45.8,20.8,45.9,46c0.2,25.4-20.9,46.5-46.3,46.4
	C324.8,410.7,304.4,390.2,304.3,364.8z"/>
                <path fill="#555555" d="M350.2,385.6c-11.4,0-20.6-9.1-20.7-20.6c-0.2-11.9,9.1-21.4,20.8-21.4c11.3,0,20.7,9.3,21,20.6
	C371.5,375.7,361.7,385.6,350.2,385.6z"/>
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <circle
                    fill="none"
                    stroke={setDigitalTwinCircleColor(digitalTwinId, digitalTwinSelected)}
                    strokeWidth="15"
                    cx="256"
                    cy="256"
                    r="240"
                />
            </SVGOverlay >
        </>
    )
};

interface GeoDigitalTwinProps {
    assetData: IAsset;
    digitalTwinData: IDigitalTwin;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwinState: IDigitalTwinState | null;
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}


const domainName = getDomainName();
const protocol = getProtocol();

const calcGeoPointPosition = (pointLongitude: number, pointLatitude: number, distance: number, angle: number): number[] => {
    const pt = point([pointLongitude, pointLatitude]);
    let bearing: number = angle;
    const position = rhumbDestination(pt, distance, bearing);
    return [position.geometry.coordinates[0], position.geometry.coordinates[1]];
}

const GeoDigitalTwin: FC<GeoDigitalTwinProps> = ({
    assetData,
    digitalTwinData,
    digitalTwinSelected,
    selectDigitalTwin,
    selectSensor,
    digitalTwinState,
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const angle = 0.0;
    const positionRadius = 0.00074 * assetData.iconRadio;
    const [centerLongitude, centerLatitude] = calcGeoPointPosition(assetData.longitude, assetData.latitude, positionRadius, angle);
    const [status, setStatus] = useState("unknown");
    const [fillColor, setFillColor] = useState("unknown");

    useEffect(() => {
        const status = findOuDigitalTwinStatus(digitalTwinState as IDigitalTwinState);
        setStatus(status);
        if (status === "ok") setFillColor(STATUS_OK)
        else if (status === "pending") setFillColor(STATUS_PENDING)
        else if (status === "alerting") setFillColor(STATUS_ALERTING);
    }, [digitalTwinData, digitalTwinState]);

    const digitalTwinRadio = 0.00012 * assetData.iconRadio;
    const bounds = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            digitalTwinRadio
        ), [centerLongitude, centerLatitude, digitalTwinRadio]);

    const digitalTwinOuterRadio = 0.00020 * assetData.iconRadio;
    const outerBounds = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            digitalTwinOuterRadio
        ), [centerLongitude, centerLatitude, digitalTwinOuterRadio]);

    const clickHandler = () => {
        selectDigitalTwin(digitalTwinData);
        selectSensor(null);
        if (digitalTwinData.type === "Gltf 3D model") {
            setGlftDataLoading(true);
            const config = axiosAuth(accessToken);
            const groupId = digitalTwinData.groupId;
            let urlDigitalTwinGltfData = `${protocol}://${domainName}/admin_api/digital_twin_gltfdata`;
            urlDigitalTwinGltfData = `${urlDigitalTwinGltfData}/${groupId}/${digitalTwinData.id}`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlDigitalTwinGltfData, config)
                .then((response) => {
                    const digitalTwinGltfData = response.data;
                    const gltfData = digitalTwinGltfData.gltfData;
                    if (gltfData !== '{}') {
                        digitalTwinGltfData.digitalTwinGltfUrl = createUrl(gltfData);
                    } else digitalTwinGltfData.digitalTwinGltfUrl = null;

                    const mqttTopics = digitalTwinGltfData.mqttTopicsData.map((topicData: IMqttTopicData) => topicData.mqttTopic);
                    const inexistentMqttTopics = mqttTopics.filter((topic: string) => topic.slice(0, 7) === "Warning");
                    if (inexistentMqttTopics.length !== 0) {
                        const warningMessage = "Some mqtt topics no longer exist"
                        toast.warning(warningMessage);
                    }
                    setGlftDataLoading(false);
                    let isGroupDTDemo = true;
                    if (assetData.type === "mobile" &&
                        assetData.description.slice(0, 16) === "Mobile for group"
                    ) {
                        isGroupDTDemo = true;
                    }
                    openDigitalTwin3DViewer(digitalTwinGltfData, isGroupDTDemo);
                })
                .catch((error) => {
                    axiosErrorHandler(error, authDispatch);
                });

        } else if (digitalTwinData.type === "Grafana dashboard") {
            const url = (digitalTwinData.dashboardUrl as string);
            if (url.slice(0, 7) === "Warning") {
                toast.warning(url);
            } else window.open(url, "_blank");
        }
    }

    return (
        <>
            {
                (status !== "unknown" && fillColor !== "unknown") &&
                <Circle
                    center={[centerLatitude, centerLongitude]}
                    pathOptions={{ stroke: false, fillOpacity: 0 }}
                    radius={0.1666 * assetData.iconRadio}
                    eventHandlers={{ click: clickHandler }}
                >
                    <DigitanTwinSvgImage
                        digitalTwinId={digitalTwinData.id}
                        digitalTwinSelected={digitalTwinSelected as IDigitalTwin}
                        fillColor={fillColor}
                        bounds={bounds as LatLngTuple[]}
                        outerBounds={outerBounds as LatLngTuple[]}
                    />
                    <Tooltip sticky>
                        <span style={{ fontWeight: 'bold' }}>Digital twin</span><br />
                        Name: {digitalTwinData.digitalTwinRef}<br />
                        Description: {digitalTwinData.description}<br />
                        Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </Tooltip>
                </Circle >
            }
        </>
    )
}

export default GeoDigitalTwin;