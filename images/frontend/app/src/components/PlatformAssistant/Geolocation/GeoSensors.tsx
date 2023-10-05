import { FC } from "react";
import { LayerGroup } from 'react-leaflet';
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import GeoSensor from "./GeoSensor";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import GeoDigitalTwin from "./GeoDigitalTwin";


interface GeoSensorsProps {
    assetSelected: IAsset;
    sensors: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor | null) => void;
    digitalTwin: IDigitalTwin;
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin | null) => void;
    digitalTwinState: IDigitalTwinState | null;
    sensorsState: ISensorState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}

const GeoSensors: FC<GeoSensorsProps> = ({
    assetSelected,
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
                sensors.map((sensor: ISensor, index: number) =>
                    <GeoSensor
                        key={sensor.id}
                        sensorLabel={`${index + 1}/${sensors.length}`}
                        assetData={assetSelected}
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