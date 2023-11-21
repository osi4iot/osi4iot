import { FC, useEffect, useState } from "react";
import { LayerGroup } from 'react-leaflet';
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import GeoSensor from "./GeoSensor";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import GeoDigitalTwin from "./GeoDigitalTwin";
import GeoFordwardAndBackwardSensor from "./GeoFordwardAndBackwardSensor";
import { ISensorType } from "../TableColumns/sensorTypesColumns";


interface GeoSensorsProps {
    assetSelected: IAsset;
    sensorTypes: ISensorType[];
    sensors: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwin: IDigitalTwin;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    digitalTwinState: IDigitalTwinState | null;
    sensorsState: ISensorState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}


const GeoSensors: FC<GeoSensorsProps> = ({
    assetSelected,
    sensorTypes,
    sensors,
    sensorSelected,
    selectSensor,
    digitalTwin,
    digitalTwinSelected,
    selectDigitalTwin,
    digitalTwinState,
    sensorsState,
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    const arrayLength = sensors.length;
    const [sensorsArray, setSensorsArray] = useState(sensors.slice(0, 10));
    const [sensorsSetIndex, setSensorsSetIndex] = useState(1);
    const [backwardButtonState, setBackwardButtonState] = useState(false);
    const [fordwardButtonState, setFordwardButtonState] = useState(arrayLength > 10);

    useEffect(() => {
        const minIndex = (sensorsSetIndex - 1) * 10;
        const maxIndex = (minIndex + 10) <= arrayLength ? (minIndex + 10) : arrayLength;
        const sensorsArray = sensors.slice(minIndex, maxIndex);
        setSensorsArray(sensorsArray);
    }, [arrayLength, sensors, sensorsSetIndex]);

    const backwardButtonClickHandler = () => {
        if (arrayLength <= 10) {
            setFordwardButtonState(false);
            setBackwardButtonState(false);
        } else {
            let newSensorsSetIndex: number;
            if (sensorsSetIndex >= 2) newSensorsSetIndex = sensorsSetIndex - 1;
            else newSensorsSetIndex = 1;
            if (newSensorsSetIndex === 1) {
                setBackwardButtonState(false);
                setFordwardButtonState(true);
            } else {
                setFordwardButtonState(true);
                setFordwardButtonState(true);
            }
            setSensorsSetIndex(newSensorsSetIndex);
        }
    }

    const fordwardButtonClickHandler = () => {
        if (arrayLength <= 10) {
            setFordwardButtonState(false);
            setBackwardButtonState(false);
        } else {
            const maxSensorsSetIndex = Math.ceil(arrayLength / 10);
            let newSensorsSetIndex: number;
            if (sensorsSetIndex < maxSensorsSetIndex) newSensorsSetIndex = sensorsSetIndex + 1;
            else newSensorsSetIndex = maxSensorsSetIndex;
            if (newSensorsSetIndex === maxSensorsSetIndex) {
                setBackwardButtonState(true);
                setFordwardButtonState(false);
            } else {
                if (newSensorsSetIndex >= 2) {
                    setBackwardButtonState(true);
                }
            }
            setSensorsSetIndex(newSensorsSetIndex);
        }
    }

    return (
        <LayerGroup>
            {digitalTwin &&
                <GeoDigitalTwin
                    assetData={assetSelected}
                    digitalTwinData={digitalTwin}
                    digitalTwinSelected={digitalTwinSelected}
                    selectDigitalTwin={selectDigitalTwin}
                    selectSensor={selectSensor}
                    digitalTwinState={digitalTwinState}
                    openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                    setGlftDataLoading={setGlftDataLoading}
                />
            }
            {
                arrayLength > 10 &&
                <>
                    <GeoFordwardAndBackwardSensor
                        clickHandler={backwardButtonClickHandler}
                        posAngle={32}
                        iconAngle={48}
                        assetData={assetSelected}
                        buttonActive={backwardButtonState}
                    />
                    <GeoFordwardAndBackwardSensor
                        clickHandler={fordwardButtonClickHandler}
                        posAngle={328}
                        iconAngle={138}
                        assetData={assetSelected}
                        buttonActive={fordwardButtonState}
                    />
                </>
            }
            {
                sensorsArray.map((sensor: ISensor, index: number) =>
                    <GeoSensor
                        key={sensor.id}
                        sensorLabel={`${(sensorsSetIndex - 1) * 10 + index + 1}/${sensors.length}`}
                        assetData={assetSelected}
                        sensorType={sensorTypes.filter(sensorType=> sensorType.type === sensor.sensorType)[0]}
                        sensorData={sensor}
                        sensorIndex={index}
                        sensorSelected={sensorSelected}
                        selectSensor={selectSensor}
                        selectDigitalTwin={selectDigitalTwin}
                        sensorsState={sensorsState}
                    />
                )
            }
        </LayerGroup>
    )
}

export default GeoSensors;