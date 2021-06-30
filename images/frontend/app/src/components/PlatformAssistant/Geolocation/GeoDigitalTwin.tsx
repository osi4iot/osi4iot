import { FC, useEffect, useMemo, useRef } from "react";
import { SVGOverlay, Circle } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDevice } from '../TableColumns/devicesColumns';
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import { IDigitalTwinState } from "../GeolocationContainer";


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

const setDigitalTwinStyle = (isSelected: boolean) => {
    return {
        stroke: true,
        color: isSelected ? SELECTED : NON_SELECTED,
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fill: true,
        fillColor: "#555555",
        fillOpacity: 0.2
    }
}


interface GeoDigitalTwinProps {
    deviceData: IDevice;
    digitalTwinIndex: number;
    digitalTwinData: IDigitalTwin;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
}

const setDigitalTwinCircleColor = (digitalTwinId: number, digitalTwinSelected: IDigitalTwin | null): string => {
    let color = NON_SELECTED;
    if (digitalTwinSelected && digitalTwinId === digitalTwinSelected.id) {
        return SELECTED;
    }
    return color;
}


const GeoDigitalTwin: FC<GeoDigitalTwinProps> = ({ deviceData, digitalTwinIndex, digitalTwinData, digitalTwinSelected, selectDigitalTwin, digitalTwinsState }) => {
    const geoJsonLayer = useRef(null);
    const deviceCircleRadius = 0.000015;
    const alpha = 2.0 * Math.PI * digitalTwinIndex / 12;
    const positionRadius = deviceCircleRadius * 0.95;
    const longitudeFact = 1.0 / Math.cos(deviceData.latitude * Math.PI / 180.0);
    const centerLongitude = deviceData.longitude + positionRadius * Math.sin(alpha) * longitudeFact;
    const centerLatitude = deviceData.latitude + positionRadius * Math.cos(alpha);
    const digitalTwinSize = 0.0000015;
    const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.digitalTwinId === digitalTwinData.id);
    const state = findOutStatus(digitalTwinsStateFiltered);


    const bounds = useMemo(() => [
        [centerLatitude - digitalTwinSize, centerLongitude - digitalTwinSize],
        [centerLatitude + digitalTwinSize, centerLongitude + digitalTwinSize],
    ], [digitalTwinSize, centerLatitude, centerLongitude]);

    
    const clickHandler = () => {
        selectDigitalTwin(digitalTwinData);
        const url = digitalTwinData.url;
        window.open(url, "_blank");
    }

    useEffect(() => {
        const currenGeoJsonLayer = geoJsonLayer.current;
        const isSelected = digitalTwinSelected?.id === digitalTwinData.id;
        if (currenGeoJsonLayer) {
            (currenGeoJsonLayer as any)
                .clearLayers()
                .setStyle(setDigitalTwinStyle(isSelected));
        }
    }, [digitalTwinData, digitalTwinSelected]);

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
                Name: {deviceData.name}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{state.charAt(0).toUpperCase() + state.slice(1)}</span>
            </Tooltip>
        </Circle >
    )
}

export default GeoDigitalTwin;