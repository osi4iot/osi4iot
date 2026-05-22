import { FC, useEffect, useState } from "react";
import { LayerGroup } from "react-leaflet";
import { toast } from "react-toastify";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import GeoSensor from "./GeoSensor";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerTools/ViewerUtils";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinState, ISensorState } from "./GeolocationContainer";
import GeoDigitalTwin from "./GeoDigitalTwin";
import GeoFordwardAndBackwardSensor from "./GeoFordwardAndBackwardSensor";
import { ISensorType } from "../TableColumns/sensorTypesColumns";
import { setReloadDigitalTwinsTable, usePlatformAssitantDispatch } from "../../../contexts/platformAssistantContext";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import { axiosAuth, axiosAuthDigitalTwinFile, getDomainName, getProtocol } from "../../../tools/tools";
import { INatsSubjectData } from "../DigitalTwin3DViewer/Main/Model";
import { mqttTopicToNatsSubject } from "../DigitalTwin3DViewer/NatsHook/tools";
import formatDateString from "../../../tools/formatDate";
import { existGltfDataLocallyStored, read3DModelFile } from "../../../tools/fileSystem";
import load3DModelData from "../../../tools/load3DModelData";
import { AxiosError, AxiosResponse } from "axios";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";

const domainName = getDomainName();
const protocol = getProtocol();

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
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void;
    setGltfFileDownloadProgress: (gltfFileDownloadProgress: number) => void;
    setAssetWithCameraSelected: (selected: boolean) => void;
    setSensorWithCameraSelected: (selected: boolean) => void;
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
    setGlftDataLoading,
    setGltfFileDownloadProgress,
    setAssetWithCameraSelected,
    setSensorWithCameraSelected,
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const arrayLength = sensors.length;
    const [sensorsArray, setSensorsArray] = useState(sensors.slice(0, 10));
    const [sensorsSetIndex, setSensorsSetIndex] = useState(1);
    const [backwardButtonState, setBackwardButtonState] = useState(false);
    const [fordwardButtonState, setFordwardButtonState] = useState(arrayLength > 10);

    useEffect(() => {
        const minIndex = (sensorsSetIndex - 1) * 10;
        const maxIndex = minIndex + 10 <= arrayLength ? minIndex + 10 : arrayLength;
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
    };

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
    };

    const clickToOpenDigitalTwin3DViewer = async () => {
        selectDigitalTwin(digitalTwin);
        selectSensor(null);
        const digitalTwinDataType = digitalTwin.type;
        let assetWithCameraSelected = false;
        for (let i = 0; i < sensors.length; i++) {
            const sensor = sensors[i];
            if (sensor.assetId === digitalTwin.assetId) {
                if (
                    sensor.sensorType === "Mobile photo" ||
                    sensor.sensorType === "Mobile video" ||
                    sensor.sensorType === "Photo camera" ||
                    sensor.sensorType === "Video camera"
                ) {
                    assetWithCameraSelected = true;
                    break;
                }
            }
        }
        setAssetWithCameraSelected(assetWithCameraSelected);

        setGlftDataLoading(true);
        setGltfFileDownloadProgress(0);
        const config = axiosAuth(accessToken);
        const groupId = digitalTwin.groupId;
        let urlDigitalTwin3DModelData = `${protocol}://${domainName}/admin_api/digital_twin_data`;
        urlDigitalTwin3DModelData = `${urlDigitalTwin3DModelData}/${groupId}/${digitalTwin.id}`;

        try {
            const response = await getAxiosInstance(refreshToken, authDispatch).get(
                urlDigitalTwin3DModelData,
                config as any,
            );

            if (response.data) {
                const digitalTwin3DModelData = response.data;
                const natsSubjectsData: INatsSubjectData[] = [];
                for (const mqttTopicData of digitalTwin3DModelData.mqttTopicsData) {
                    const natsSubjectData: INatsSubjectData = {
                        topicId: mqttTopicData.topicId,
                        topicRef: mqttTopicData.topicRef,
                        natsSubject: mqttTopicToNatsSubject(mqttTopicData.mqttTopic),
                        lastMeasurement: mqttTopicData.lastMeasurement,
                    };
                    natsSubjectsData.push(natsSubjectData);
                }
                digitalTwin3DModelData.natsSubjectsData = natsSubjectsData;

                let urlDigitalTwinGltfFile = `${protocol}://${domainName}/admin_api/digital_twin_gltffile`;
                urlDigitalTwinGltfFile = `${urlDigitalTwinGltfFile}/${groupId}/${digitalTwin.id}`;

                let urlDigitalTwinGlbFile = `${protocol}://${domainName}/admin_api/digital_twin_glbfile`;
                urlDigitalTwinGlbFile = `${urlDigitalTwinGlbFile}/${groupId}/${digitalTwin.id}`;

                const digitalTwinUid = digitalTwin.digitalTwinUid;
                const gltfFileName = digitalTwin3DModelData.gltfFileName.split("/")[4];
                const gltfFileDate = formatDateString(digitalTwin3DModelData.gltfFileDate);
                const gltfFileSize = digitalTwin3DModelData.gltfFileSize;
                const config3DModelFile = axiosAuthDigitalTwinFile(
                    accessToken,
                    digitalTwinDataType,
                    gltfFileSize,
                    setGltfFileDownloadProgress,
                );

                const istGltfDataLocallyStored = await existGltfDataLocallyStored(
                    digitalTwinUid,
                    gltfFileName,
                    gltfFileDate,
                );

                if (istGltfDataLocallyStored) {
                    setGltfFileDownloadProgress(100);
                    const digitalTwin3DModelFile = await read3DModelFile(digitalTwinUid, gltfFileName);
                    load3DModelData(
                        null,
                        digitalTwinDataType,
                        digitalTwin3DModelData,
                        digitalTwin3DModelFile,
                        setGlftDataLoading,
                        openDigitalTwin3DViewer,
                        assetSelected,
                        gltfFileName,
                        gltfFileDate,
                    );
                } else {
                    if (digitalTwinDataType === "Gltf 3D model") {
                        setGltfFileDownloadProgress(0);
                        getAxiosInstance(refreshToken, authDispatch)
                            .get(urlDigitalTwinGltfFile, config3DModelFile as any)
                            .then((response: AxiosResponse<any, any>) => {
                                const digitalTwin3DModelFile = response.data;
                                load3DModelData(
                                    digitalTwinUid,
                                    digitalTwinDataType,
                                    digitalTwin3DModelData,
                                    digitalTwin3DModelFile,
                                    setGlftDataLoading,
                                    openDigitalTwin3DViewer,
                                    assetSelected,
                                    gltfFileName,
                                    gltfFileDate,
                                );
                                const reloadDigitalTwinsTable = true;
                                setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                            })
                            .catch((error: AxiosError) => {
                                axiosErrorHandler(error, authDispatch);
                            });
                    } else if (digitalTwinDataType === "Glb 3D model") {
                        getAxiosInstance(refreshToken, authDispatch)
                            .get(urlDigitalTwinGlbFile, config3DModelFile as any)
                            .then((response: AxiosResponse<any, any>) => {
                                const digitalTwin3DModelFile = response.data;
                                load3DModelData(
                                    digitalTwinUid,
                                    digitalTwinDataType,
                                    digitalTwin3DModelData,
                                    digitalTwin3DModelFile,
                                    setGlftDataLoading,
                                    openDigitalTwin3DViewer,
                                    assetSelected,
                                    gltfFileName,
                                    gltfFileDate,
                                );
                                const reloadDigitalTwinsTable = true;
                                setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                            })
                            .catch((error: AxiosError) => {
                                axiosErrorHandler(error, authDispatch);
                            });
                    } else if (digitalTwinDataType === "Grafana dashboard") {
                        const digitalTwinGltfData: IDigitalTwinGltfData = {
                            id: digitalTwin3DModelData.id,
                            gltfFile: null,
                            digitalTwinGltfUrl: null,
                            femResFileInfoList: digitalTwin3DModelData.femResFileInfoList,
                            natsSubjectsData: digitalTwin3DModelData.natsSubjectsData,
                            sensorsDashboards: digitalTwin3DModelData.sensorsDashboards,
                            topicIdBySensorRef: digitalTwin3DModelData.topicIdBySensorRef,
                            digitalTwinSimulationFormat: digitalTwin3DModelData.digitalTwinSimulationFormat,
                            isGroupDTDemo: digitalTwin3DModelData.isGroupDTDemo,
                        };
                        openDigitalTwin3DViewer(digitalTwinGltfData);
                        setGlftDataLoading(false);
                    }
                }
            } else {
                toast.error("Digital twin 3D model data not found");
                setGlftDataLoading(false);
            }
        } catch (error: any) {
            toast.error("Digital twin 3D model data not found");
            setGlftDataLoading(false);
        }
    };

    return (
        <LayerGroup>
            {digitalTwin && (
                <GeoDigitalTwin
                    assetData={assetSelected}
                    digitalTwinData={digitalTwin}
                    digitalTwinSelected={digitalTwinSelected}
                    digitalTwinState={digitalTwinState}
                    setSensorWithCameraSelected={setSensorWithCameraSelected}
                    clickToOpenDigitalTwin3DViewer={clickToOpenDigitalTwin3DViewer}
                />
            )}
            {arrayLength > 10 && (
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
            )}
            {sensorsArray.map((sensor: ISensor, index: number) => (
                <GeoSensor
                    key={sensor.id}
                    sensorLabel={`${(sensorsSetIndex - 1) * 10 + index + 1}/${sensors.length}`}
                    assetData={assetSelected}
                    sensorType={sensorTypes.filter((sensorType) => sensorType.type === sensor.sensorType)[0]}
                    sensorData={sensor}
                    sensorIndex={index}
                    sensorSelected={sensorSelected}
                    selectSensor={selectSensor}
                    selectDigitalTwin={selectDigitalTwin}
                    sensorsState={sensorsState}
                    setSensorWithCameraSelected={setSensorWithCameraSelected}
                    clickToOpenDigitalTwin3DViewer={clickToOpenDigitalTwin3DViewer}
                />
            ))}
        </LayerGroup>
    );
};

export default GeoSensors;
