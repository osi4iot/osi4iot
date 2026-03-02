import natsClient from "../../config/natsConfig";
import { nanoid } from "nanoid";
import PipelineDto from "./pipeline.dto";
import { updateDigitalTwinPipelineFileDataById } from "./digitalTwinDAL";
import PipelineFileDataDto from "./pipelineFileData.dto";
import { areCyclesInPipeline, areThereInjectTopicsInPublish } from "./pipeline_cycles_detection";
import IDigitalTwin from "./digitalTwin.interface";
import { getGroupByProp } from "../group/groupDAL";
import { getOrganizationByProp } from "../organization/organizationDAL";

// Función auxiliar para generar un UID único basado en el nombre
const generateUid = (): string => {
	const uid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	return uid;
};

export const createDigitalTwinPipeline = async (
	digitalTwinId: number,
	pipelineData: PipelineDto,
	groupId: number,
	isDefault = false
): Promise<void> => {
	const pipelineNodes = pipelineData.nodes;
	const group = await getGroupByProp("id", groupId);
	const org = await getOrganizationByProp("id", group.orgId);

	const hasInjectNodesInPublish = areThereInjectTopicsInPublish(pipelineNodes);
	if (hasInjectNodesInPublish) {
		throw new Error("The pipeline contains 'inject' topics in 'Publish' nodes, which is not allowed.");
	}

	const hasCycles = await areCyclesInPipeline(digitalTwinId, pipelineNodes);
	if (hasCycles) {
		throw new Error("The pipeline contains cycles, which is not allowed.");
	}

	for (const node of pipelineNodes) {
		if (node.type === "AiAgent") {
			const orgLlmEnabled = org?.llmEnabled || false;
			const groupLlmEnabled = group?.llmEnabled || false;

			if (!orgLlmEnabled) {
				throw new Error("LLM is not enabled for this organization.");
			}

			if (!groupLlmEnabled) {
				throw new Error("LLM is not enabled for this group.");
			}
		}
	}

	// Primer paso: procesar todos los nodos y generar UIDs si es necesario
	pipelineNodes.forEach((node) => {
		if (!node.nodeUid) {
			node.nodeUid = generateUid();
		}
	});

	const updatePipelineDto: PipelineFileDataDto = {
		pipelineFileName: pipelineData.pipelineFileName,
		pipelineFileLastModifDate: pipelineData.pipelineFileLastModifDate,
		pipelineFileData: JSON.stringify(pipelineData.nodes),
	};
	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto, isDefault);

	if (!isDefault) {
		const context = {
			digitalTwinId,
			groupId,
		};
		await natsClient.jsPublish("pipeline_action", "create", digitalTwinId, context);
	}
};

export const updateDigitalTwinPipeline = async (
	digitalTwinId: number,
	pipelineData: PipelineDto,
	groupId: number
): Promise<void> => {
	const group = await getGroupByProp("id", groupId);
	const org = await getOrganizationByProp("id", group.orgId);
	const hasInjectNodesInPublish = areThereInjectTopicsInPublish(pipelineData.nodes);
	if (hasInjectNodesInPublish) {
		throw new Error("The pipeline contains 'inject' topics in 'Publish' nodes, which is not allowed.");
	}

	const hasCycles = await areCyclesInPipeline(digitalTwinId, pipelineData.nodes);
	if (hasCycles) {
		throw new Error("The pipeline contains cycles, which is not allowed.");
	}

	for (const node of pipelineData.nodes) {
		if (node.type === "AiAgent") {
			const orgLlmEnabled = org?.llmEnabled || false;
			const groupLlmEnabled = group?.llmEnabled || false;

			if (!orgLlmEnabled) {
				throw new Error("LLM is not enabled for this organization.");
			}

			if (!groupLlmEnabled) {
				throw new Error("LLM is not enabled for this group.");
			}
		}
	}

	pipelineData.nodes.forEach((node) => {
		if (!node.nodeUid) {
			node.nodeUid = generateUid();
		}
	});

	const updatePipelineDto: PipelineFileDataDto = {
		pipelineFileName: pipelineData.pipelineFileName,
		pipelineFileLastModifDate: pipelineData.pipelineFileLastModifDate,
		pipelineFileData: JSON.stringify(pipelineData.nodes),
	};
	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto);

	const reinitialize = pipelineData.reinitialize || false;
	const context = {
		groupId,
		reinitialize,
	};
	await natsClient.jsPublish("pipeline_action", "update", digitalTwinId, context);
};

export const deleteDigitalTwinPipeline = async (digitalTwinId: number, groupId: number): Promise<void> => {
	const updatePipelineDto: PipelineFileDataDto = {
		pipelineFileName: "-",
		pipelineFileLastModifDate: "-",
		pipelineFileData: "",
	};

	const context = {
		groupId,
	};
	await natsClient.jsPublish("pipeline_action", "delete", digitalTwinId, context);

	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto);
};

export const applyPipelineAction = async (
	digitalTwin: IDigitalTwin,
	action: string,
	reinitialize: boolean,
	groupId: number
): Promise<void> => {
	if (!["start", "stop", "restart"].includes(action)) {
		throw new Error("Invalid action. Allowed actions are: start, stop, restart.");
	}

	const digitalTwinId = digitalTwin.id;

	const context = {
		groupId,
		reinitialize,
	};
	await natsClient.jsPublish("pipeline_action", action, digitalTwinId, context);
};

export const createDefaultPipelineDataForDigitalTwin = (): PipelineDto => {
	const defaultPipeline: PipelineDto = {
		pipelineFileName: "pipeline_all_dev2pdb.yml",
		pipelineFileLastModifDate: new Date().toISOString(),
		nodes: [],
	};

	const nodeCommentUid: string = generateUid();
	const nodeCommentSettings = {
		comment: "Store all dev2pdb topics in IoT DB",
	};

	const nodeListenerUid: string = generateUid();
	const nodeListenerSettings = {
		listenTo: "Topic reference",
		topic: "all_dev2pdb",
	};
	const nodeFunctionUid: string = generateUid();
	const nodeFunctionSettings = {
		onMessageScript: `function process(msg) {
    const go = Go();
    const { log, utils } = go.All();

    const topic = utils.GetTopicFromMessage(msg);
    msg.payload.sql = {
        "action": "Insert",
        "insertTopic": topic
    };

    return msg;
}`,
		onInitializationScript: `function init() {
    const go = Go();
    const { log, time } = go.All();

    // Your code here
}`,
		onStartScript: `function start() {
    const go = Go();
    const { log, time } = go.All();

    // Your code here
}`,
		debugEnabled: false,
	};

	const nodeIoTDBUid: string = generateUid();
	const nodeIoTDBSettings = {
		paramOptions: "query_from_payload",
		action: "Insert",
		topicRef: "dev2pdb_2",
		sqlQuery: "SELECT * FROM iot_table WHERE topic = $topic",
		startTime: "now-25s",
		endTime: "now",
		queryMode: "query_from_payload",
	};

	defaultPipeline.nodes.push(
		{
			nodeUid: nodeCommentUid,
			name: "Comment 1",
			type: "Comment",
			x: 30,
			y: 40,
			numOutputs: 0,
			settings: JSON.stringify(nodeCommentSettings),
			wires: [],
		},
		{
			nodeUid: nodeListenerUid,
			name: "Listen all dev2pdb",
			type: "Listen",
			x: 30,
			y: 90,
			numOutputs: 1,
			settings: JSON.stringify(nodeListenerSettings),
			wires: [[{ nodeEndUid: nodeFunctionUid }]],
		},
		{
			nodeUid: nodeFunctionUid,
			name: "Set sql query",
			type: "Function",
			x: 180,
			y: 90,
			numOutputs: 1,
			settings: JSON.stringify(nodeFunctionSettings),
			wires: [[{ nodeEndUid: nodeIoTDBUid }]],
		},
		{
			nodeUid: nodeIoTDBUid,
			name: "Store in IoT DB",
			type: "IoTDb",
			x: 320,
			y: 90,
			numOutputs: 0,
			settings: JSON.stringify(nodeIoTDBSettings),
			wires: [],
		}
	);

	return defaultPipeline;
};
