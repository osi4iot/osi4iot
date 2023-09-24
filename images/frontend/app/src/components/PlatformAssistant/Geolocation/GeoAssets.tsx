import { FC } from "react";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState } from "./GeolocationContainer";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import GeoAsset from "./GeoAsset";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";

interface GeoAssetsProps {
    assetDataArray: IAsset[];
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
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }) => {

    //const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);

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
                        openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                        setGlftDataLoading={setGlftDataLoading}
                    />
                })
            }
        </>
    )
}

export default GeoAssets;