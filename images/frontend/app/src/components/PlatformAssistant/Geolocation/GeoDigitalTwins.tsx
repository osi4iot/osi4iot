import { FC } from "react";
import { LayerGroup } from 'react-leaflet';
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import { IDigitalTwinState } from "./GeolocationContainer";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import GeoDigitalTwin from "./GeoDigitalTwin";
import { IAsset } from "../TableColumns/assetsColumns";


interface GeoDigitalTwinsProps {
    assetSelected: IAsset;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}

const GeoDigitalTwins: FC<GeoDigitalTwinsProps> = ({
    assetSelected,
    digitalTwins,
    digitalTwinSelected,
    selectDigitalTwin,
    digitalTwinsState,
    openDigitalTwin3DViewer,
    setGlftDataLoading
}) => {
    return (
        <LayerGroup>
            {
                digitalTwins.map((digitalTwin: IDigitalTwin, index: number) =>
                    <GeoDigitalTwin
                        key={digitalTwin.id}
                        assetData={assetSelected}
                        digitalTwinIndex={index}
                        digitalTwinData={digitalTwin}
                        digitalTwinSelected={digitalTwinSelected}
                        selectDigitalTwin={selectDigitalTwin}
                        digitalTwinsState={digitalTwinsState}
                        openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                        setGlftDataLoading={setGlftDataLoading}
                    />
                )
            }
        </LayerGroup>
    )
}

export default GeoDigitalTwins;