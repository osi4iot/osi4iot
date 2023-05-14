import { FC, useEffect, useMemo, useState } from "react";
import { SVGOverlay, Circle } from 'react-leaflet';
import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import { IDigitalTwinState } from "./GeolocationContainer";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { createUrl, IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { toast } from "react-toastify";
import { IMqttTopicData } from "../DigitalTwin3DViewer/Model";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";

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

const DigitanTwinGrafanaSvgImage: FC<DigitanTwinSvgImageProps> = ({
    digitalTwinId,
    digitalTwinSelected,
    fillColor,
    bounds,
    outerBounds
}) => {
    return (
        <>
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path d="M496 384H64V80c0-8.84-7.16-16-16-16H16C7.16 64 0 71.16 0 80v336c0 17.67 14.33 32 32 32h464c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zM464 96H345.94c-21.38 0-32.09 25.85-16.97 40.97l32.4 32.4L288 242.75l-73.37-73.37c-12.5-12.5-32.76-12.5-45.25 0l-68.69 68.69c-6.25 6.25-6.25 16.38 0 22.63l22.62 22.62c6.25 6.25 16.38 6.25 22.63 0L192 237.25l73.37 73.37c12.5 12.5 32.76 12.5 45.25 0l96-96 32.4 32.4c15.12 15.12 40.97 4.41 40.97-16.97V112c.01-8.84-7.15-16-15.99-16z" />
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <circle
                    fill="none"
                    stroke={setDigitalTwinCircleColor(digitalTwinId, digitalTwinSelected)}
                    stroke-width="15"
                    cx="256"
                    cy="256"
                    r="240"
                />
            </SVGOverlay >
        </>
    )
};

const DigitanTwin3DModelSvgImage: FC<DigitanTwinSvgImageProps> = ({
    digitalTwinId,
    digitalTwinSelected,
    fillColor,
    bounds,
    outerBounds
}) => {
    return (
        <>
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path d="M488.6 250.2L392 214V105.5c0-15-9.3-28.4-23.4-33.7l-100-37.5c-8.1-3.1-17.1-3.1-25.3 0l-100 37.5c-14.1 5.3-23.4 18.7-23.4 33.7V214l-96.6 36.2C9.3 255.5 0 268.9 0 283.9V394c0 13.6 7.7 26.1 19.9 32.2l100 50c10.1 5.1 22.1 5.1 32.2 0l103.9-52 103.9 52c10.1 5.1 22.1 5.1 32.2 0l100-50c12.2-6.1 19.9-18.6 19.9-32.2V283.9c0-15-9.3-28.4-23.4-33.7zM358 214.8l-85 31.9v-68.2l85-37v73.3zM154 104.1l102-38.2 102 38.2v.6l-102 41.4-102-41.4v-.6zm84 291.1l-85 42.5v-79.1l85-38.8v75.4zm0-112l-102 41.4-102-41.4v-.6l102-38.2 102 38.2v.6zm240 112l-85 42.5v-79.1l85-38.8v75.4zm0-112l-102 41.4-102-41.4v-.6l102-38.2 102 38.2v.6z" />
            </SVGOverlay >
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={outerBounds as LatLngTuple[]}>
                <circle
                    fill="none"
                    stroke={setDigitalTwinCircleColor(digitalTwinId, digitalTwinSelected)}
                    stroke-width="15"
                    cx="256"
                    cy="256"
                    r="240"
                />
            </SVGOverlay >
        </>
    )
};


interface GeoDigitalTwinProps {
    deviceData: IDevice;
    digitalTwinIndex: number;
    digitalTwinData: IDigitalTwin;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}


const domainName = getDomainName();
const protocol = getProtocol();

const calcGeoPointPosition = (pointLongitude: number, pointLatitude: number, distance: number, angle: number): number[] => {
    const pt = point([pointLongitude, pointLatitude]);
    let bearing: number = angle;
    if (angle > 180) {
        bearing = angle - 360;
    }
    const position = rhumbDestination(pt, distance, bearing);
    return [position.geometry.coordinates[0], position.geometry.coordinates[1]];
}

const GeoDigitalTwin: FC<GeoDigitalTwinProps> = ({
    deviceData,
    digitalTwinIndex,
    digitalTwinData,
    digitalTwinSelected,
    selectDigitalTwin,
    digitalTwinsState,
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const angle = 360 * digitalTwinIndex / 12;
    const positionRadius = 0.00076 * deviceData.iconRadio;
    const [centerLongitude, centerLatitude] = calcGeoPointPosition(deviceData.longitude, deviceData.latitude, positionRadius, angle);
    const [status, setStatus] = useState("unknown");
    const [fillColor, setFillColor] = useState("unknown");

    useEffect(() => {
        const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.digitalTwinId === digitalTwinData.id);
        const status = findOutStatus(digitalTwinsStateFiltered);
        setStatus(status);
        if (status === "ok") setFillColor(STATUS_OK)
        else if (status === "pending") setFillColor(STATUS_PENDING)
        else if (status === "alerting") setFillColor(STATUS_ALERTING);
    }, [digitalTwinData, digitalTwinsState]);

    const digitalTwinGrafanaRadio = 0.00008 * deviceData.iconRadio;
    const boundsGrafana = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            digitalTwinGrafanaRadio
        ), [centerLongitude, centerLatitude, digitalTwinGrafanaRadio]);

    const digitalTwinGrafanaOuterRadio = 0.00018 * deviceData.iconRadio;
    const outerBoundsGrafana = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            digitalTwinGrafanaOuterRadio
        ), [centerLongitude, centerLatitude, digitalTwinGrafanaOuterRadio]);

    const digitalTwin3DModelRadio = 0.0001 * deviceData.iconRadio;
    const bounds3DModel = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            digitalTwin3DModelRadio
        ), [centerLongitude, centerLatitude, digitalTwin3DModelRadio]);

    const digitalTwin3DModelOuterRadio = 0.00018 * deviceData.iconRadio;
    const outerBounds3DModel = useMemo(() =>
        calcGeoBounds(
            centerLongitude,
            centerLatitude,
            digitalTwin3DModelOuterRadio
        ), [centerLongitude, centerLatitude, digitalTwin3DModelOuterRadio]);


    const clickHandler = () => {
        selectDigitalTwin(digitalTwinData);
        if (digitalTwinData.type === "Gltf 3D model") {
            setGlftDataLoading(true);
            const config = axiosAuth(accessToken);
            const groupId = digitalTwinData.groupId;
            const deviceId = digitalTwinData.deviceId;
            let urlDigitalTwinGltfData = `${protocol}://${domainName}/admin_api/digital_twin_gltfdata`;
            urlDigitalTwinGltfData = `${urlDigitalTwinGltfData}/${groupId}/${deviceId}/${digitalTwinData.id}`;
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
                    openDigitalTwin3DViewer(digitalTwinGltfData);
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
                    radius={0.1666 * deviceData.iconRadio}
                    eventHandlers={{ click: clickHandler }}
                >
                    {digitalTwinData.type === "Grafana dashboard" &&

                        <DigitanTwinGrafanaSvgImage
                            digitalTwinId={digitalTwinData.id}
                            digitalTwinSelected={digitalTwinSelected as IDigitalTwin}
                            fillColor={fillColor}
                            bounds={boundsGrafana as LatLngTuple[]}
                            outerBounds={outerBoundsGrafana as LatLngTuple[]}
                        />
                    }
                    {digitalTwinData.type === "Gltf 3D model" &&
                        <DigitanTwin3DModelSvgImage
                            digitalTwinId={digitalTwinData.id}
                            digitalTwinSelected={digitalTwinSelected as IDigitalTwin}
                            fillColor={fillColor}
                            bounds={bounds3DModel as LatLngTuple[]}
                            outerBounds={outerBounds3DModel as LatLngTuple[]}
                        />
                    }
                    <Tooltip sticky>
                        <span style={{ fontWeight: 'bold' }}>Digital twin</span><br />
                        Description: {digitalTwinData.description}<br />
                        Ref: {digitalTwinData.digitalTwinUid}<br />
                        Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </Tooltip>
                </Circle >
            }
        </>
    )
}

export default GeoDigitalTwin;