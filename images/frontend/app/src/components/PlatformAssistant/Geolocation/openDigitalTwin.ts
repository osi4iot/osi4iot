import { toast } from "react-toastify";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerTools/ViewerUtils";
import { INatsSubjectData } from "../DigitalTwin3DViewer/Main/Model";
import { mqttTopicToNatsSubject } from "../DigitalTwin3DViewer/NatsHook/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";

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

// Loads a digital twin's data and opens it in the Viewer (which loads the 3D model of the slide it shows). Used by the map and by the asset switcher (Ctrl K).
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

        // the 3D models are those of the slides of its Viewer: the Viewer loads the model of the slide it shows
        // (DigitalTwin3DViewer/Main/slideModel.ts)
        const digitalTwinGltfData: IDigitalTwinGltfData = {
            id: digitalTwin3DModelData.id,
            gltfFile: null,
            digitalTwinGltfUrl: null,
            femResFileInfoList: [],
            natsSubjectsData: digitalTwin3DModelData.natsSubjectsData,
            sensorsDashboards: digitalTwin3DModelData.sensorsDashboards,
            topicIdBySensorRef: digitalTwin3DModelData.topicIdBySensorRef,
            digitalTwinSimulationFormat: digitalTwin3DModelData.digitalTwinSimulationFormat,
            isGroupDTDemo: asset.assetType === "Mobile" && asset.description.slice(0, 16) === "Mobile for group",
            assetContext: digitalTwin3DModelData.assetContext,
            gltfFileName: "",
            slideModels: digitalTwin3DModelData.slideModels ?? {},
        };
        if (natsSubjectsData.some((subject) => subject.natsSubject.slice(0, 7) === "Warning")) {
            toast.warning("Some NATS subjects no longer exist");
        }
        setGltfFileDownloadProgress(100);
        openDigitalTwin3DViewer(digitalTwinGltfData);
        setGlftDataLoading(false);
    } catch (error: any) {
        toast.error("Digital twin 3D model data not found");
        setGlftDataLoading(false);
    }
};

export default openDigitalTwin;
