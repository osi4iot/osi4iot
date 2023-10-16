import { FC, useEffect, useMemo, useState } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";

import GeoSensors from "./GeoSensors";
import { AssetSvgImages } from "./AssetSvgImages";


interface GeoAssetProps {
    assetData: IAsset;
    assetSelected: IAsset | null;
    selectAsset: (assetSelected: IAsset | null) => void;
    sensorDataArray: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}

const GeoAsset: FC<GeoAssetProps> = ({
    assetData,
    assetSelected,
    selectAsset,
    sensorDataArray,
    sensorSelected,
    selectSensor,
    digitalTwins,
    digitalTwinSelected,
    selectDigitalTwin,
    digitalTwinsState,
    sensorsState,
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    const [status, setStatus] = useState("unknown");
    const [fillColor, setFillColor] = useState(STATUS_OK);
    const map = useMap();
    const digitalTwinFiltered = digitalTwins.filter(digitalTwin => digitalTwin.assetId === assetSelected?.id)[0];
    const digitalTwinStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.assetId === assetData.id)[0];
    const sensorsFiltered = sensorDataArray.filter(sensor => sensor.assetId === assetData.id);
    const sensorStateFiltered = sensorsState.filter(sensor => sensor.assetId === assetData.id);

    useEffect(() => {
        const assetsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.assetId === assetData.id);
        const status = findOutStatus(assetsStateFiltered, sensorStateFiltered);
        setStatus(status);
        if (status === "ok") setFillColor(STATUS_OK)
        else if (status === "pending") setFillColor(STATUS_PENDING)
        else if (status === "alerting") setFillColor(STATUS_ALERTING);
    }, [assetData, digitalTwinsState, sensorStateFiltered]);

    const outerBounds = useMemo(() => calcGeoBounds(assetData.longitude, assetData.latitude, assetData.iconRadio * 0.001), [assetData]);
    const bounds = useMemo(() => calcGeoBounds(assetData.longitude, assetData.latitude, assetData.iconRadio * 0.00045), [assetData]);

    useEffect(() => {
        if (assetSelected && assetSelected.id === assetData.id) {

            map.fitBounds(outerBounds as LatLngTuple[]);
        }
    }, [assetData, assetSelected, outerBounds, map]);

    const clickHandler = () => {
        selectAsset(assetData);
        selectDigitalTwin(null);
        map.fitBounds(outerBounds as LatLngTuple[]);
    }

    useEffect(() => {
        if (assetSelected?.id === assetData.id) map.fitBounds(outerBounds as LatLngTuple[]);
    }, [assetSelected, assetData, outerBounds, map]);

    return (
        <Circle
            center={[assetData.latitude, assetData.longitude]}
            pathOptions={{ stroke: false, fillOpacity: 0 }}
            radius={assetData.iconRadio}
            eventHandlers={{ click: clickHandler }}
        >
            <AssetSvgImages
                key={`${assetData.id}-${status}`}
                status={status}
                assetId={assetData.id}
                assetType={assetData.type}
                assetSelected={assetSelected as IAsset}
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
                imageRef={null}
            />
            {
                (!assetSelected || !(assetSelected?.id === assetData.id)) &&
                <Tooltip sticky>
                    <span style={{ fontWeight: 'bold' }}>Asset</span><br />
                    Name: {`Asset_${assetData.assetUid}`}<br />
                    Type: {assetData.type}<br />
                    Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                </Tooltip>
            }
            {
                (assetSelected && assetSelected.id === assetData.id) &&
                <GeoSensors
                    key={status}
                    assetSelected={assetSelected}
                    sensors={sensorsFiltered}
                    sensorSelected={sensorSelected}
                    selectSensor={selectSensor}
                    digitalTwin={digitalTwinFiltered}
                    digitalTwinSelected={digitalTwinSelected}
                    selectDigitalTwin={selectDigitalTwin}
                    digitalTwinState={digitalTwinStateFiltered}
                    sensorsState={sensorStateFiltered}
                    openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                    setGlftDataLoading={setGlftDataLoading}
                />

            }
        </Circle >
    )
}

export default GeoAsset;