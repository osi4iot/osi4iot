import natsClient from "../../config/natsConfig";
import { nanoid } from "nanoid";
import PipelineDto from "./pipeline.dto";
import { updateDigitalTwinPipelineFileDataById } from "./digitalTwinDAL";
import PipelineFileDataDto from "./pipelineFileData.dto";
import { areCyclesInPipeline, areThereInjectTopicsInPublish } from "./pipeline_cycles_detection";
import IDigitalTwin from "./digitalTwin.interface";

// Función auxiliar para generar un UID único basado en el nombre
const generateUid = (): string => {
	const uid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	return uid;
};

export const createDigitalTwinPipeline = async (
	digitalTwinId: number,
	pipelineData: PipelineDto,
	groupId: number
): Promise<void> => {
	const pipelineNodes = pipelineData.nodes;

	const hasInjectNodesInPublish = areThereInjectTopicsInPublish(pipelineNodes);
	if (hasInjectNodesInPublish) {
		throw new Error("The pipeline contains 'inject' topics in 'Publish' nodes, which is not allowed.");
	}

	const hasCycles = await areCyclesInPipeline(digitalTwinId, pipelineNodes);
	if (hasCycles) {
		throw new Error("The pipeline contains cycles, which is not allowed.");
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
	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto);

	const context = {
		digitalTwinId,
		groupId,
	};
	await natsClient.jsPublish("pipeline_action", "create", digitalTwinId, context);
};

export const updateDigitalTwinPipeline = async (
	digitalTwinId: number,
	pipelineData: PipelineDto,
	groupId: number
): Promise<void> => {
	const hasInjectNodesInPublish = areThereInjectTopicsInPublish(pipelineData.nodes);
	if (hasInjectNodesInPublish) {
		throw new Error("The pipeline contains 'inject' topics in 'Publish' nodes, which is not allowed.");
	}

	const hasCycles = await areCyclesInPipeline(digitalTwinId, pipelineData.nodes);
	if (hasCycles) {
		throw new Error("The pipeline contains cycles, which is not allowed.");
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
