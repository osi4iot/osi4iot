import { FC, useEffect, useMemo, useState } from "react";
import { Circle, useMap } from 'react-leaflet';
import { StyledTooltip as Tooltip } from './Tooltip';
import { LatLngTuple } from 'leaflet';
import { IDigitalTwinState } from "./GeolocationContainer";
import { findOutStatus, STATUS_ALERTING, STATUS_OK, STATUS_PENDING } from "./statusTools";
import calcGeoBounds from "../../../tools/calcGeoBounds";
import GeoDigitalTwins from "./GeoDigitalTwins";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";

import { AssetSvgImages } from "./AssetSvgImages";
import GeoSensors from "./GeoSensors";


interface GeoAssetProps {
    assetData: IAsset;
    assetSelected: IAsset | null;
    selectAsset: (assetSelected: IAsset) => void;
    sensorDataArray: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
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
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    const [status, setStatus] = useState("unknown");
    const [fillColor, setFillColor] = useState(STATUS_OK);
    const map = useMap();
    //const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);
    const sensorsFiltered = sensorDataArray.filter(sensor => sensor.assetId === assetData.id);

    // useEffect(() => {
    //     const devicesStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.deviceId === deviceData.id);
    //     const status = findOutStatus(devicesStateFiltered);
    //     setStatus(status);
    //     if (status === "ok") setFillColor(STATUS_OK)
    //     else if (status === "pending") setFillColor(STATUS_PENDING)
    //     else if (status === "alerting") setFillColor(STATUS_ALERTING);
    // }, [deviceData, digitalTwinsState]);

    const outerBounds = useMemo(() => calcGeoBounds(assetData.longitude, assetData.latitude, assetData.iconRadio * 0.001), [assetData]);
    const bounds = useMemo(() => calcGeoBounds(assetData.longitude, assetData.latitude, assetData.iconRadio * 0.00045), [assetData]);

    const clickHandler = () => {
        map.fitBounds(outerBounds as LatLngTuple[]);
        selectAsset(assetData);
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
                status={status}
                assetId={assetData.id}
                assetType={assetData.type}
                assetSelected={assetSelected as IAsset}
                fillColor={fillColor}
                bounds={bounds as LatLngTuple[]}
                outerBounds={outerBounds as LatLngTuple[]}
            />
            <Tooltip sticky>
                <span style={{ fontWeight: 'bold' }}>Asset</span><br />
                Name: {`Asset_${assetData.assetUid}`}<br />
                Type: {assetData.type}<br />
                Status: <span style={{ fontWeight: 'bold' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </Tooltip>
            {
                assetSelected &&
                <GeoSensors
                    key={status}
                    assetSelected={assetSelected}
                    sensors={sensorDataArray}
                    sensorSelected={sensorSelected}
                    selectSensor={selectSensor}
                />
            }
        </Circle >
    )
}

export default GeoAsset;