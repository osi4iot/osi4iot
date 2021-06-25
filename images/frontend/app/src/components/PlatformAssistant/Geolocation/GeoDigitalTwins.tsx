import { FC } from "react";
import { LayerGroup } from 'react-leaflet';
import { IDevice } from "../TableColumns/devicesColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoDigitalTwin from "./GeoDigitalTwin";


interface GeoDigitalTwinsProps {
    deviceSelected: IDevice;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
}

const GeoDigitalTwins: FC<GeoDigitalTwinsProps> = ({ deviceSelected, digitalTwins, digitalTwinSelected, selectDigitalTwin }) => {

    return (
        <LayerGroup>
            {
                digitalTwins.map((digitalTwin: IDigitalTwin, index: number) =>
                    <GeoDigitalTwin
                        key={digitalTwin.id}
                        deviceData={deviceSelected}
                        digitalTwinIndex={index}
                        digitalTwinData={digitalTwin}
                        digitalTwinSelected={digitalTwinSelected}
                        selectDigitalTwin={selectDigitalTwin}
                    />
                )
            }
        </LayerGroup>
    )
}

export default GeoDigitalTwins;