import { IMobileTopic } from "../components/PlatformAssistant/TableColumns/topicsColumns";

// The sensor types the "Mobile sensors" page feeds from the phone, each with
// the topic type its form publishes to (admin_api lists the assets with at
// least one of them, whatever their asset type).
export const MOBILE_SENSOR_TOPIC_TYPE: Record<string, "dev2pdb_wt" | "dev2dtm"> = {
    "Mobile geolocation": "dev2pdb_wt",
    "Mobile accelerations": "dev2pdb_wt",
    "Mobile orientation": "dev2pdb_wt",
    "Mobile motion": "dev2pdb_wt",
    "Mobile photo": "dev2dtm",
    "Mobile video": "dev2dtm",
    "Mobile audio": "dev2dtm",
};

export const isMobileSensorType = (sensorType: string): boolean => sensorType in MOBILE_SENSOR_TOPIC_TYPE;

// The topic of the sensor chosen in the selection form (asset name +
// sensor description, which is what the form shows). Its sensorType, not its
// description, decides which form opens: a sensor of type "Mobile
// accelerations" described "Front axle phone" opens the accelerations form.
export const findMobileTopic = (
    topics: IMobileTopic[],
    assetName: string,
    sensorDescription: string,
): IMobileTopic | undefined =>
    topics.find((t) => `Asset_${t.assetUid}` === assetName && t.sensorDescription === sensorDescription);
