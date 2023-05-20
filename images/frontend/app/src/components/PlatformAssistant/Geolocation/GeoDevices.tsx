import { FC } from "react";
import { IDevice } from "../TableColumns/devicesColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState } from "./GeolocationContainer";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerUtils";
import GeoDevice from "./GeoDevice";
import GeoMasterDevice from "./GeoMasterDevice";

interface GeoDevicesProps {
    deviceDataArray: IDevice[];
    deviceSelected: IDevice | null;
    selectDevice: (deviceSelected: IDevice) => void;
    digitalTwins: IDigitalTwin[];
    digitalTwinSelected: IDigitalTwin | null;
    selectDigitalTwin: (digitalTwinSelected: IDigitalTwin) => void;
    digitalTwinsState: IDigitalTwinState[];
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
}


const GeoDevices: FC<GeoDevicesProps> = (
    {
        deviceDataArray,
        deviceSelected,
        selectDevice,
        digitalTwins,
        digitalTwinSelected,
        selectDigitalTwin,
        digitalTwinsState,
        openDigitalTwin3DViewer,
        setGlftDataLoading
    }) => {

    const digitalTwinsFiltered = digitalTwins.filter(digitalTwin => digitalTwin.deviceId === deviceSelected?.id);
    return (
        <>
            {
                deviceDataArray.map(deviceData => {
                    return deviceData.type === "Generic" ?
                        <GeoDevice
                            key={deviceData.id}
                            deviceData={deviceData}
                            deviceSelected={deviceSelected}
                            selectDevice={selectDevice}
                            digitalTwins={digitalTwinsFiltered}
                            digitalTwinSelected={digitalTwinSelected}
                            selectDigitalTwin={selectDigitalTwin}
                            digitalTwinsState={digitalTwinsState}
                            openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                            setGlftDataLoading={setGlftDataLoading}
                        />
                        :
                        <GeoMasterDevice
                            key={deviceData.id}
                            deviceData={deviceData}
                            deviceSelected={deviceSelected}
                            selectDevice={selectDevice}
                            digitalTwinsState={digitalTwinsState}
                        />
                })
            }
        </>
    )
}

export default GeoDevices;