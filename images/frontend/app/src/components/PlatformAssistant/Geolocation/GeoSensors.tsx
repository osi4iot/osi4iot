import { FC } from "react";
import { LayerGroup } from 'react-leaflet';
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import GeoSensor from "./GeoSensor";


interface GeoSensorsProps {
    assetSelected: IAsset;
    sensors: ISensor[];
    sensorSelected: ISensor | null;
    selectSensor: (sensorSelected: ISensor) => void;
}

const GeoSensors: FC<GeoSensorsProps> = ({
    assetSelected,
    sensors,
    sensorSelected,
    selectSensor
}) => {
    return (
        <LayerGroup>
            {
                sensors.map((sensor: ISensor, index: number) =>
                    <GeoSensor
                        key={sensor.id}
                        sensorLabel={`${index+1}/${sensors.length}`}
                        assetData={assetSelected}
                        sensorData={sensor}
                        sensorIndex={index}
                        sensorSelected={sensorSelected}
                        selectSensor={selectSensor}
                    />
                )
            }
        </LayerGroup>
    )
}

export default GeoSensors;