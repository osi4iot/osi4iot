import { FC } from "react";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import GeoAsset from "./GeoAsset";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";

interface GeoAssetsProps {
    assetDataArray: IAsset[];
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


const GeoAssets: FC<GeoAssetsProps> = (
    {
        assetDataArray,
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

    return (
        <>
            {
                assetDataArray.map(asset => {
                    return <GeoAsset
                        key={asset.id}
                        assetData={asset}
                        assetSelected={assetSelected}
                        selectAsset={selectAsset}
                        sensorDataArray={sensorDataArray}
                        sensorSelected={sensorSelected}
                        selectSensor={selectSensor}
                        digitalTwins={digitalTwins}
                        digitalTwinSelected={digitalTwinSelected}
                        selectDigitalTwin={selectDigitalTwin}
                        digitalTwinsState={digitalTwinsState}
                        sensorsState={sensorsState}
                        openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                        setGlftDataLoading={setGlftDataLoading}
                    />
                })
            }
        </>
    )
}

export default GeoAssets;