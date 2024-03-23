import { FC } from "react";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import GeoAsset from "./GeoAsset";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import { IAssetType } from "../TableColumns/assetTypesColumns";
import { ISensorType } from "../TableColumns/sensorTypesColumns";

interface GeoAssetsProps {
    assetTypeDataArray: IAssetType[];
    assetDataArray: IAsset[];
    assetSelected: IAsset | null;
    selectAsset: (assetSelected: IAsset | null) => void;
    sensorTypeDataArray: ISensorType[];
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
    fetchGltfFileWorker: Worker;
}


const GeoAssets: FC<GeoAssetsProps> = (
    {
        assetTypeDataArray,
        assetDataArray,
        assetSelected,
        selectAsset,
        sensorTypeDataArray,
        sensorDataArray,
        sensorSelected,
        selectSensor,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState,
        sensorsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading,
        fetchGltfFileWorker
    }) => {

    return (
        <>
            {
                assetDataArray.map(asset => {
                    return <GeoAsset
                        key={asset.id}
                        assetTypeData={assetTypeDataArray.filter(assetType=> assetType.type === asset.assetType)[0]}
                        assetData={asset}
                        assetSelected={assetSelected}
                        selectAsset={selectAsset}
                        sensorTypeDataArray={sensorTypeDataArray}
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
                        fetchGltfFileWorker={fetchGltfFileWorker}
                    />
                })
            }
        </>
    )
}

export default GeoAssets;