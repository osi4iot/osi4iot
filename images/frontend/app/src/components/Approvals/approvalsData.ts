// What the Approvals page asks: the Approval nodes of the pipelines of the digital twins the user manages that are
// decided from the platform (channel "viewer" or "both"), each with the digital twin's "approval" NATS subject
// and the names of its group and asset. The requests themselves are asked to pipelines (approvalRequests.ts).
import { mqttTopicToNatsSubject } from "../PlatformAssistant/DigitalTwin3DViewer/NatsHook/tools";
import { APPROVAL_TOPIC_REF } from "../PlatformAssistant/DigitalTwin3DViewer/Pipeline/approvalRequests";

export interface ApprovalNodeRef {
    nodeUid: string;
    name: string;
    title: string;
}

export interface ApprovalTarget {
    key: string; // digital twin uid + node uid
    groupId: number;
    groupLabel: string;
    assetId: number;
    assetLabel: string;
    digitalTwinUid: string;
    digitalTwinLabel: string;
    subject: string;
    nodeUid: string;
    nodeName: string;
}

export interface ApprovalsDigitalTwin {
    id: number;
    groupId: number;
    assetId: number;
    digitalTwinUid: string;
    description: string;
    pipelineFileData: string;
}

export interface ApprovalsGroup {
    id: number;
    name: string;
    acronym: string;
}

export interface ApprovalsAsset {
    id: number;
    assetUid: string;
    description: string;
}

// The mqtt topics of a group's digital twins (admin_api digital_twin_mqtt_topics_in_group):
// { "DT_<uid>": { "approval": "approval/Group_<uid>/Topic_<uid>", ... } }
export type DigitalTwinMqttTopics = Record<string, Record<string, string>>;

// The Approval nodes of a stored pipeline that are decided from the platform
export const approvalNodesOfPipeline = (pipelineFileData: string | null | undefined): ApprovalNodeRef[] => {
    if (!pipelineFileData) return [];
    let nodes: unknown;
    try {
        nodes = JSON.parse(pipelineFileData);
    } catch {
        return [];
    }
    if (!Array.isArray(nodes)) return [];
    return nodes
        .filter((n) => n && n.type === "Approval" && (n.settings?.channel ?? "viewer") !== "telegram" && n.nodeUid)
        .map((n) => ({
            nodeUid: String(n.nodeUid),
            name: String(n.name || "Approval"),
            title: String(n.settings?.title || "Approval request"),
        }));
};

const assetName = (asset: ApprovalsAsset | undefined, assetId: number) =>
    asset ? asset.description || `Asset_${asset.assetUid}` : `Asset ${assetId}`;

export const groupLabelOf = (group: ApprovalsGroup | undefined, groupId: number) =>
    group ? `${group.acronym}${group.name && group.name !== group.acronym ? ` · ${group.name}` : ""}` : `Group ${groupId}`;

// Everything to ask, sorted by group, asset and digital twin. Digital twins without an approval topic (a
// pipeline not saved since the Approval node was added) are left out.
export const buildApprovalTargets = (
    digitalTwins: ApprovalsDigitalTwin[],
    groups: ApprovalsGroup[],
    assets: ApprovalsAsset[],
    topicsByGroup: Record<number, DigitalTwinMqttTopics>,
): ApprovalTarget[] => {
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const assetById = new Map(assets.map((a) => [a.id, a]));
    const targets: ApprovalTarget[] = [];
    for (const dt of digitalTwins) {
        const nodes = approvalNodesOfPipeline(dt.pipelineFileData);
        if (nodes.length === 0) continue;
        const mqttTopic = topicsByGroup[dt.groupId]?.[`DT_${dt.digitalTwinUid}`]?.[APPROVAL_TOPIC_REF];
        if (!mqttTopic) continue;
        const subject = mqttTopicToNatsSubject(mqttTopic);
        for (const node of nodes) {
            targets.push({
                key: `${dt.digitalTwinUid}/${node.nodeUid}`,
                groupId: dt.groupId,
                groupLabel: groupLabelOf(groupById.get(dt.groupId), dt.groupId),
                assetId: dt.assetId,
                assetLabel: assetName(assetById.get(dt.assetId), dt.assetId),
                digitalTwinUid: dt.digitalTwinUid,
                digitalTwinLabel: dt.description || `DT_${dt.digitalTwinUid}`,
                subject,
                nodeUid: node.nodeUid,
                nodeName: node.name,
            });
        }
    }
    return targets.sort(
        (a, b) =>
            a.groupLabel.localeCompare(b.groupLabel) ||
            a.assetLabel.localeCompare(b.assetLabel) ||
            a.digitalTwinLabel.localeCompare(b.digitalTwinLabel) ||
            a.nodeName.localeCompare(b.nodeName),
    );
};

// The groups that have digital twins with Approval nodes (for the page to ask their topics)
export const groupsWithApprovalNodes = (digitalTwins: ApprovalsDigitalTwin[]): number[] =>
    Array.from(new Set(digitalTwins.filter((dt) => approvalNodesOfPipeline(dt.pipelineFileData).length > 0).map((dt) => dt.groupId)));

// "in 25 min", "3 h ago"...
export const relativeTime = (iso: string | undefined, now: number): string => {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const diff = t - now;
    const abs = Math.abs(diff);
    let text: string;
    if (abs < 60_000) text = `${Math.max(1, Math.round(abs / 1000))} s`;
    else if (abs < 3_600_000) text = `${Math.round(abs / 60_000)} min`;
    else if (abs < 86_400_000) text = `${Math.round(abs / 3_600_000)} h`;
    else text = `${Math.round(abs / 86_400_000)} d`;
    return diff >= 0 ? `in ${text}` : `${text} ago`;
};
