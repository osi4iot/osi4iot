import { FC, useMemo } from "react";
import { SVGOverlay, Circle } from 'react-leaflet';
import rhumbDestination from '@turf/rhumb-destination';
import { point } from '@turf/helpers';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import { IDigitalTwinState } from "../GeolocationContainer";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { createUrl, IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { toast } from "react-toastify";


interface DigitanTwinSvgImageProps {
    fillColor: string;
    bounds: LatLngTuple[];
}

const DigitanTwinSvgImage: FC<DigitanTwinSvgImageProps> = ({ fillColor, bounds }) => {
    return (
        <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
            <SVGOverlay attributes={{ viewBox: "0 0 512 512", fill: fillColor }} bounds={bounds as LatLngTuple[]}>
                <path d="M496 384H64V80c0-8.84-7.16-16-16-16H16C7.16 64 0 71.16 0 80v336c0 17.67 14.33 32 32 32h464c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zM464 96H345.94c-21.38 0-32.09 25.85-16.97 40.97l32.4 32.4L288 242.75l-73.37-73.37c-12.5-12.5-32.76-12.5-45.25 0l-68.69 68.69c-6.25 6.25-6.25 16.38 0 22.63l22.62 22.62c6.25 6.25 16.38 6.25 22.63 0L192 237.25l73.37 73.37c12.5 12.5 32.76 12.5 45.25 0l96-96 32.4 32.4c15.12 15.12 40.97 4.41 40.97-16.97V112c.01-8.84-7.15-16-15.99-16z" />
            </SVGOverlay>
        </SVGOverlay >
    )
};


const SELECTED = "#3274d9";
const NON_SELECTED = "#9c9a9a";


interface GeoDigitalTwinProps {
    deviceData: IDevice;
    digitalTwinIndex: number;
    digitalTwinData: IDigitalTwin;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
}

const setDigitalTwinCircleColor = (digitalTwinId: number, digitalTwinSelected: IDigitalTwin | null): string => {
    let color = NON_SELECTED;
    if (digitalTwinSelected && digitalTwinId === digitalTwinSelected.id) {
        return SELECTED;
    }
    return color;
}

const domainName = getDomainName();

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
    openDigitalTwin3DViewer
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const angle = 360 * digitalTwinIndex / 12;
    const positionRadius = 0.00115;
    const [centerLongitude, centerLatitude] = calcGeoPointPosition(deviceData.longitude, deviceData.latitude, positionRadius, angle);

    const digitalTwinRadio = 0.00012;
    const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.digitalTwinId === digitalTwinData.id);
    const state = findOutStatus(digitalTwinsStateFiltered);

    const bounds = useMemo(() => calcGeoBounds(centerLongitude, centerLatitude, digitalTwinRadio), [centerLongitude, centerLatitude]);

    const clickHandler = () => {
        selectDigitalTwin(digitalTwinData);
        if (digitalTwinData.type === "Gltf 3D model") {
            const config = axiosAuth(accessToken);
            const groupId = digitalTwinData.groupId;
            const deviceId = digitalTwinData.deviceId;
            let urlDigitalTwinGltfData = `https://${domainName}/admin_api/digital_twin_gltfdata`;
            urlDigitalTwinGltfData = `${urlDigitalTwinGltfData}/${groupId}/${deviceId}/${digitalTwinData.id}`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlDigitalTwinGltfData, config)
                .then((response) => {
                    const digitalTwinGltfData = response.data;
                    const gltfData = digitalTwinGltfData.gltfData;
                    if (Object.keys(gltfData).length) {
                        digitalTwinGltfData.digitalTwinGltfUrl = createUrl(JSON.stringify(gltfData));
                    } else digitalTwinGltfData.digitalTwinGltfUrl = null;

                    const femSimulationData = digitalTwinGltfData.femSimulationData;
                    if (Object.keys(femSimulationData).length) {
                        digitalTwinGltfData.femSimulationUrl = createUrl(JSON.stringify(femSimulationData));
                    } else digitalTwinGltfData.femSimulationUrl = null;                    

                    const inexistentMqttTopics = digitalTwinGltfData.mqttTopics.filter((topic: string) => topic.slice(0, 7) === "Warning");
                    if (inexistentMqttTopics.length !== 0) {
                        const warningMessage = "Some mqtt topics no longer exist"
						toast.warning(warningMessage);
                    }
                    openDigitalTwin3DViewer(digitalTwinGltfData);
                })
                .catch((error) => {
                    const errorMessage = error.response.data.message;
                    toast.error(errorMessage);
                });

        } else if (digitalTwinData.type === "Grafana dashboard") {
            const url = (digitalTwinData.dashboardUrl as string);
            if (url.slice(0, 7) === "Warning") {
                toast.warning(url);
            } else window.open(url, "_blank");
        }
    }

    return (
        <Circle
            center={[centerLatitude, centerLongitude]}
            pathOptions={{ color: setDigitalTwinCircleColor(digitalTwinData.id, digitalTwinSelected), fillColor: "#555555" }}
            radius={0.25}
            eventHandlers={{ click: clickHandler }}
        >
            {
                state === "ok" && <DigitanTwinSvgImage fillColor={STATUS_OK} bounds={bounds as LatLngTuple[]} />
            }
            {
                state === "pending" && <DigitanTwinSvgImage fillColor={STATUS_PENDING} bounds={bounds as LatLngTuple[]} />
            }
            {
                state === "alerting" && <DigitanTwinSvgImage fillColor={STATUS_ALERTING} bounds={bounds as LatLngTuple[]} />
            }
            <Tooltip sticky>
                <span style={{ fontWeight: 'bold' }}>Digital twin</span><br />
                Name: {digitalTwinData.name}<br />
                Type: {digitalTwinData.type}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{state.charAt(0).toUpperCase() + state.slice(1)}</span>
            </Tooltip>
        </Circle >
    )
}

export default GeoDigitalTwin;