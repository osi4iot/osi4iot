import { toast } from "react-toastify";
import { IDigitalTwinGltfData, createUrl } from "../components/PlatformAssistant/DigitalTwin3DViewer/ViewerUtils";
import { IAsset } from "../components/PlatformAssistant/TableColumns/assetsColumns";
import { writeGltfData } from "./fileSystem";
import { IMqttTopicData } from "../components/PlatformAssistant/DigitalTwin3DViewer/Model";

const loadGltfData = (
    digitalTwinUid: string | null,
    digitalTwinGltfData: any,
    setGlftDataLoading: (gtGlftDataLoading: boolean) => void,
    openDigitalTwin3DViewer: (digitalTwinGltfData: IDigitalTwinGltfData, isGroupDTDemo: boolean) => void,
    assetData: IAsset,
    gltfFileName: string,
    glttFileDate: string,
) => {
    let gltfData: string;
    if (typeof digitalTwinGltfData.gltfData === 'object') {
        gltfData = JSON.stringify(digitalTwinGltfData.gltfData);
    } else {
        gltfData = digitalTwinGltfData.gltfData;
    }

    if (gltfData !== '{}') {
        digitalTwinGltfData.digitalTwinGltfUrl = createUrl(gltfData);
    } else digitalTwinGltfData.digitalTwinGltfUrl = null;

    const mqttTopics = digitalTwinGltfData.mqttTopicsData.map((topicData: IMqttTopicData) => topicData.mqttTopic);
    const inexistentMqttTopics = mqttTopics.filter((topic: string) => topic.slice(0, 7) === "Warning");
    if (inexistentMqttTopics.length !== 0) {
        const warningMessage = "Some mqtt topics no longer exist"
        toast.warning(warningMessage);
    }
    setGlftDataLoading(false);
    let isGroupDTDemo = false;
    if (assetData.assetType === "Mobile" &&
        assetData.description.slice(0, 16) === "Mobile for group"
    ) {
        isGroupDTDemo = true;
    }
    openDigitalTwin3DViewer(digitalTwinGltfData, isGroupDTDemo);
    if (digitalTwinUid) {
        writeGltfData(digitalTwinUid, digitalTwinGltfData, gltfFileName, glttFileDate);
    }
}

export default loadGltfData;