import { toast } from "react-toastify";
import { IDigitalTwinGltfData, createUrl } from "../components/PlatformAssistant/DigitalTwin3DViewer/ViewerUtils";
import { IAsset } from "../components/PlatformAssistant/TableColumns/assetsColumns";
import { write3DModelFile } from "./fileSystem";
import { IMqttTopicData } from "../components/PlatformAssistant/DigitalTwin3DViewer/Model";
import { loadAndParseGltfFile } from "./loadAndParseGltfFile";
import { giveBrowserType } from "./tools";

const load3DModelData = (
    digitalTwinUid: string | null,
    digitalTwinDataType: string,
    digitalTwin3DModelData: any,
    digitalTwin3DModelFile: any,
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void,
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData) => void,
    assetData: IAsset,
    gltfFileName: string,
    gltfFileDate: string,
) => {
    let gltfFile: any;
    if (digitalTwinDataType === 'Gltf 3D model') {
        gltfFile = JSON.stringify(digitalTwin3DModelFile);
    } else {
        gltfFile = digitalTwin3DModelFile;
    }

    let digitalTwin3DModelUrl: string | null;
    if (gltfFile !== '{}') {
        digitalTwin3DModelUrl = createUrl(gltfFile);
    } else digitalTwin3DModelUrl = null;

    const digitalTwinGltfData = {
        id: digitalTwin3DModelData.id,
        gltfFile,
        digitalTwinGltfUrl: digitalTwin3DModelUrl,
        femResFileInfoList: digitalTwin3DModelData.femResFileInfoList,
        mqttTopicsData: digitalTwin3DModelData.mqttTopicsData,
        sensorsDashboards: digitalTwin3DModelData.sensorsDashboards,
        topicIdBySensorRef: digitalTwin3DModelData.topicIdBySensorRef,
        digitalTwinSimulationFormat: digitalTwin3DModelData.digitalTwinSimulationFormat,
        isGroupDTDemo: digitalTwin3DModelData.isGroupDTDemo,
    };

    const mqttTopics = digitalTwin3DModelData.mqttTopicsData.map((topicData: IMqttTopicData) => topicData.mqttTopic);
    const inexistentMqttTopics = mqttTopics.filter((topic: string) => topic.slice(0, 7) === "Warning");
    if (inexistentMqttTopics.length !== 0) {
        const warningMessage = "Some mqtt topics no longer exist"
        toast.warning(warningMessage);
    }
    let isGroupDTDemo = false;
    if (assetData.assetType === "Mobile" &&
        assetData.description.slice(0, 16) === "Mobile for group"
    ) {
        isGroupDTDemo = true;
    }

    loadAndParseGltfFile(digitalTwinGltfData.digitalTwinGltfUrl as string).then(async (data) => {
        digitalTwinGltfData.gltfFile = data;
        digitalTwinGltfData.isGroupDTDemo = isGroupDTDemo;
        setGlftDataLoading(false);
        openDigitalTwin3DViewer(digitalTwinGltfData);
        if (digitalTwinUid) {
            await write3DModelFile(digitalTwinUid, gltfFile, gltfFileName, gltfFileDate);
        }
    }).catch((error) => {
        URL.revokeObjectURL(digitalTwinGltfData.digitalTwinGltfUrl as string);
        setGlftDataLoading(false);
        let errorMessage = "Error loading GLTF file";
        if (digitalTwinDataType === 'Gb 3D model') {
            errorMessage = "Error loading GLB file";
        }
        const browserType = giveBrowserType();
        if (browserType === "Firefox" && digitalTwinDataType === 'Gltf 3D model') {
            errorMessage = "Error loading GLTF file. GLTF files are not fully supported by Firefox. Please try using GLB files instead.";
        }
        toast.error(errorMessage);
    });
}

export default load3DModelData;