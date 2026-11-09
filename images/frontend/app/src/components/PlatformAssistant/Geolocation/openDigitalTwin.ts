import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
import { reloadTable } from "../../../state";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerTools/ViewerUtils";
import { INatsSubjectData } from "../DigitalTwin3DViewer/Main/Model";
import { mqttTopicToNatsSubject } from "../DigitalTwin3DViewer/NatsHook/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import { axiosAuth, axiosAuthDigitalTwinFile, getDomainName, getProtocol } from "../../../tools/tools";
import formatDateString from "../../../tools/formatDate";
import { existGltfDataLocallyStored, read3DModelFile } from "../../../tools/fileSystem";
import load3DModelData from "../../../tools/load3DModelData";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";

const CAMERA_SENSOR_TYPES = ["Mobile photo", "Mobile video", "Photo camera", "Video camera"];

// True when one of the asset's sensors is a camera, so the Viewer shows the Image panel.
export const assetHasCamera = (assetId: number, sensors: ISensor[]): boolean =>
    sensors.some((sensor) => sensor.assetId === assetId && CAMERA_SENSOR_TYPES.includes(sensor.sensorType));

export interface OpenDigitalTwinDeps {
    accessToken: string;
    refreshToken: string;
    authDispatch: any;
    setGlftDataLoading: (loading: boolean) => void;
    setGltfFileDownloadProgress: (progress: number) => void;
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void;
    setAssetWithCameraSelected: (selected: boolean) => void;
}

// Loads a digital twin (its data and its 3D model, from the local cache when possible)
// and opens it in the Viewer. Used by the map and by the asset switcher (Ctrl K).
const openDigitalTwin = async (
    digitalTwin: IDigitalTwin,
    asset: IAsset,
    sensors: ISensor[],
    deps: OpenDigitalTwinDeps,
): Promise<void> => {
    const {
        accessToken,
        refreshToken,
        authDispatch,
        setGlftDataLoading,
        setGltfFileDownloadProgress,
        openDigitalTwin3DViewer,
        setAssetWithCameraSelected,
    } = deps;
    const domainName = getDomainName();
    const protocol = getProtocol();
    const digitalTwinDataType = digitalTwin.type;
    setAssetWithCameraSelected(assetHasCamera(digitalTwin.assetId, sensors));

    setGlftDataLoading(true);
    setGltfFileDownloadProgress(0);
    const config = axiosAuth(accessToken);
    const groupId = digitalTwin.groupId;
    const urlDigitalTwin3DModelData = `${protocol}://${domainName}/admin_api/digital_twin_data/${groupId}/${digitalTwin.id}`;

    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).get(
            urlDigitalTwin3DModelData,
            config as any,
        );

        if (!response.data) {
            toast.error("Digital twin 3D model data not found");
            setGlftDataLoading(false);
            return;
        }

        const digitalTwin3DModelData = response.data;
        const natsSubjectsData: INatsSubjectData[] = [];
        for (const mqttTopicData of digitalTwin3DModelData.mqttTopicsData) {
            natsSubjectsData.push({
                topicId: mqttTopicData.topicId,
                topicRef: mqttTopicData.topicRef,
                natsSubject: mqttTopicToNatsSubject(mqttTopicData.mqttTopic),
                lastMeasurement: mqttTopicData.lastMeasurement,
            });
        }
        digitalTwin3DModelData.natsSubjectsData = natsSubjectsData;

        const urlDigitalTwinGltfFile = `${protocol}://${domainName}/admin_api/digital_twin_gltffile/${groupId}/${digitalTwin.id}`;
        const urlDigitalTwinGlbFile = `${protocol}://${domainName}/admin_api/digital_twin_glbfile/${groupId}/${digitalTwin.id}`;

        const digitalTwinUid = digitalTwin.digitalTwinUid;
        const gltfFileName = digitalTwin3DModelData.gltfFileName.split("/")[5];
        const gltfFileDate = formatDateString(digitalTwin3DModelData.gltfFileDate);
        const gltfFileSize = digitalTwin3DModelData.gltfFileSize;
        const config3DModelFile = axiosAuthDigitalTwinFile(
            accessToken,
            digitalTwinDataType,
            gltfFileSize,
            setGltfFileDownloadProgress,
        );

        const isGltfDataLocallyStored = await existGltfDataLocallyStored(digitalTwinUid, gltfFileName, gltfFileDate);

        if (isGltfDataLocallyStored) {
            setGltfFileDownloadProgress(100);
            const digitalTwin3DModelFile = await read3DModelFile(digitalTwinUid, gltfFileName);
            load3DModelData(
                null,
                digitalTwinDataType,
                digitalTwin3DModelData,
                digitalTwin3DModelFile,
                setGlftDataLoading,
                openDigitalTwin3DViewer,
                asset,
                gltfFileName,
                gltfFileDate,
            );
            return;
        }

        const downloadAndLoad = (url: string) => {
            setGltfFileDownloadProgress(0);
            getAxiosInstance(refreshToken, authDispatch)
                .get(url, config3DModelFile as any)
                .then((fileResponse: AxiosResponse<any, any>) => {
                    load3DModelData(
                        digitalTwinUid,
                        digitalTwinDataType,
                        digitalTwin3DModelData,
                        fileResponse.data,
                        setGlftDataLoading,
                        openDigitalTwin3DViewer,
                        asset,
                        gltfFileName,
                        gltfFileDate,
                    );
                    reloadTable("digitalTwins");
                })
                .catch((error: AxiosError) => {
                    setGlftDataLoading(false);
                    axiosErrorHandler(error, authDispatch);
                });
        };

        if (digitalTwinDataType === "Gltf 3D model") {
            downloadAndLoad(urlDigitalTwinGltfFile);
        } else if (digitalTwinDataType === "Glb 3D model") {
            downloadAndLoad(urlDigitalTwinGlbFile);
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
        } else {
            setGlftDataLoading(false);
        }
    } catch (error: any) {
        toast.error("Digital twin 3D model data not found");
        setGlftDataLoading(false);
    }
};

export default openDigitalTwin;
