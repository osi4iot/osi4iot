import CreateNodeDto from "../pipelines/node/node.dto";
import INode from "../pipelines/node/node.interface";
import {
	createNewNode,
	deleteNodeByPropName,
	getNodeByPropName,
	getNodesByDigitalTwinId,
	updateNodeByPropName,
} from "../pipelines/node/nodeDAL";
import IWire from "../pipelines/wire/wire.interface";
import {
	createNewWire,
	deleteWireByPropName,
	getWireByPropName,
	getWiresByDigitalTwinId,
	updateWireById,
} from "../pipelines/wire/wireDAL";
import IWireWithUidDto from "../pipelines/wire/wireWithUid.inteface";
import natsClient from "../../config/natsConfig";
import { nanoid } from "nanoid";
import PipelineDto from "./pipeline.dto";
import { areCyclesInPipeline, areThereInjectTopicsInPublish } from "../pipelines/utils/cycles_detection";
import { updateDigitalTwinPipelineFileDataById } from "./digitalTwinDAL";
import PipelineFileDataDto from "./pipelineFileData.dto";

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
	const existentNodes = await getNodesByDigitalTwinId(digitalTwinId);
	if (existentNodes.length > 0) {
		throw new Error("A pipeline already exists for this digital twin.");
	}

	const pipelineNodes = pipelineData.nodes;

	const hasInjectNodesInPublish = areThereInjectTopicsInPublish(pipelineNodes);
	if (hasInjectNodesInPublish) {
		throw new Error("The pipeline contains 'inject' topics in 'Publish' nodes, which is not allowed.");
	}

	const hasCycles = await areCyclesInPipeline(digitalTwinId, pipelineNodes);
	if (hasCycles) {
		throw new Error("The pipeline contains cycles, which is not allowed.");
	}

	const nodesData = new Map<string, CreateNodeDto>();
	const wiresData = new Map<string, IWireWithUidDto>();
	const nodeNameToUidMap = new Map<string, string>(); // Mapeo de nombre a UID

	// Primer paso: procesar todos los nodos y generar UIDs si es necesario
	pipelineNodes.forEach((node) => {
		// Generar nodeUid si no está definido
		const nodeUid = node.nodeUid || generateUid();

		// Guardar el mapeo de nombre a UID
		nodeNameToUidMap.set(node.name, nodeUid);

		if (!nodesData.has(nodeUid)) {
			const newNode: CreateNodeDto = {
				digitalTwinId,
				nodeUid,
				name: node.name,
				x: node.x,
				y: node.y,
				numOutputs: node.numOutputs,
				type: node.type,
				settings: node.settings,
				debug: node.debug || "off",
			};
			nodesData.set(nodeUid, newNode);
		}
	});

	// Segundo paso: procesar todos los wires con los UIDs ya generados
	pipelineNodes.forEach((node) => {
		const nodeUid = nodeNameToUidMap.get(node.name);
		if (!nodeUid) {
			throw new Error(`Node UID not found for node name "${node.name}"`);
		}

		if (node.numOutputs === 0) {
			return; // Skip nodes with no outputs
		}

		node.wires.forEach((wireArray, outputIndex) => {
			wireArray.forEach((wire) => {
				// Generar wireUid si no está definido
				const wireUid = wire.wireUid || generateUid();

				let nodeEndUid = wire.nodeEndUid;
				if (nodeEndUid === undefined && wire.nodeEndName) {
					nodeEndUid = nodeNameToUidMap.get(wire.nodeEndName);
					if (!nodeEndUid) {
						throw new Error(`Node with name "${wire.nodeEndName}" not found in pipeline`);
					}
				}

				if (!wiresData.has(wireUid)) {
					const wireName = wire.name || `${node.name}:${outputIndex}:${wire.nodeEndName}`;
					const newWire: IWireWithUidDto = {
						name: wireName,
						wireUid,
						nodeIniUid: nodeUid,
						niniOutputIndex: outputIndex,
						nodeEndUid,
					};
					wiresData.set(wireUid, newWire);
				}
			});
		});
	});

	const nodes = new Map<string, INode>();
	const nodePromises = Array.from(nodesData.entries()).map(async ([nodeUid, pipelineNode]) => {
		let node: INode | null = await getNodeByPropName("node_uid", nodeUid);
		if (!node) {
			node = await createNewNode(pipelineNode, groupId);
		}
		return { nodeUid, node };
	});

	const nodeResults = await Promise.all(nodePromises);
	nodeResults.forEach(({ nodeUid, node }) => {
		nodes.set(nodeUid, node);
	});

	const wirePromises = Array.from(wiresData.entries()).map(async ([wireUid, wireData]) => {
		let wire: IWire | null = await getWireByPropName("wire_uid", wireUid);
		if (!wire) {
			const nodeIniId = nodes.get(wireData.nodeIniUid)?.id;
			const nodeEndId = nodes.get(wireData.nodeEndUid)?.id;

			if (nodeIniId === undefined || nodeEndId === undefined) {
				throw new Error(
					`Missing node references for wire ${wireUid}. NodeIni: ${wireData.nodeIniUid}, NodeEnd: ${wireData.nodeEndUid}`
				);
			}

			const newWire = {
				name: wireData.name,
				digitalTwinId,
				wireUid,
				nodeIniId,
				niniOutputIndex: wireData.niniOutputIndex,
				nodeEndId,
			};
			wire = await createNewWire(newWire, groupId);
		}
		return { wireUid, wire };
	});

	await Promise.all(wirePromises);

	const updatePipelineDto: PipelineFileDataDto = {
		pipelineFileName: pipelineData.pipelineFileName,
		pipelineFileLastModifDate: pipelineData.pipelineFileLastModifDate,
		pipelineFileData: JSON.stringify(pipelineData.nodes),
	};
	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto);

	const context = {
		digitalTwinId,
		groupId,
		reinitialize: true, // Always reinitialize on creation
	};
	await natsClient.jsPublish("pipeline_action", "start", digitalTwinId, context);
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

	// Get existing nodes and wires
	const existingNodes = await getNodesByDigitalTwinId(digitalTwinId);
	const existingWires = await getWiresByDigitalTwinId(digitalTwinId);

	// Create maps for easy access
	const existingNodesMap = new Map(existingNodes.map((node) => [node.nodeUid, node]));
	const existingWiresMap = new Map(existingWires.map((wire) => [wire.wireUid, wire]));

	// Crear mapeos de nombres a UIDs existentes
	const existingNodeNameToUidMap = new Map(existingNodes.map((node) => [node.name, node.nodeUid]));
	const nodeNameToUidMap = new Map<string, string>();

	// Process incoming pipeline data
	const incomingNodesMap = new Map<string, CreateNodeDto>();
	const incomingWiresMap = new Map<string, IWireWithUidDto>();

	// Primer paso: procesar nodos y generar/reutilizar UIDs
	pipelineData.nodes.forEach((node) => {
		// Usar UID existente si el nodo ya existe, si no, usar el proporcionado o generar uno nuevo
		let nodeUid = node.nodeUid;
		if (!nodeUid) {
			nodeUid = existingNodeNameToUidMap.get(node.name) || generateUid();
		}

		nodeNameToUidMap.set(node.name, nodeUid);

		if (!incomingNodesMap.has(nodeUid)) {
			const nodeData: CreateNodeDto = {
				digitalTwinId,
				nodeUid,
				name: node.name,
				x: node.x,
				y: node.y,
				numOutputs: node.numOutputs,
				type: node.type,
				settings: node.settings,
				debug: node.debug || "off", // Default to "off" if not provided
			};
			incomingNodesMap.set(nodeUid, nodeData);
		}
	});

	// Segundo paso: procesar wires con los UIDs ya establecidos
	pipelineData.nodes.forEach((node) => {
		const nodeUid = nodeNameToUidMap.get(node.name);
		if (!nodeUid) {
			throw new Error(`Node UID not found for node name "${node.name}"`);
		}

		if (node.numOutputs === 0) {
			return; // Skip nodes with no outputs
		}
		node.wires.forEach((wireArray, outputIndex) => {
			wireArray.forEach((wire) => {
				let nodeEndUid = wire.nodeEndUid;
				if (nodeEndUid === undefined && wire.nodeEndName) {
					nodeEndUid = nodeNameToUidMap.get(wire.nodeEndName);
					if (!nodeEndUid) {
						throw new Error(`Node with name "${wire.nodeEndName}" not found in pipeline`);
					}
				}

				// Buscar wire existente por origen, destino y índice de salida
				let wireUid = wire.wireUid;
				if (!wireUid) {
					// Buscar wire existente que coincida con la conexión
					const existingWire = existingWires.find((w) => {
						const existingNodeIni = existingNodes.find((n) => n.id === w.nodeIniId);
						const existingNodeEnd = existingNodes.find((n) => n.id === w.nodeEndId);
						return (
							existingNodeIni?.nodeUid === nodeUid &&
							existingNodeEnd?.nodeUid === nodeEndUid &&
							w.niniOutputIndex === outputIndex
						);
					});

					wireUid = existingWire?.wireUid || generateUid();
				}

				if (!incomingWiresMap.has(wireUid)) {
					const wireName = wire.name || `${node.name}:${outputIndex}:${wire.nodeEndName}`;
					const wireData: IWireWithUidDto = {
						name: wireName,
						wireUid,
						nodeIniUid: nodeUid,
						niniOutputIndex: outputIndex,
						nodeEndUid,
					};
					incomingWiresMap.set(wireUid, wireData);
				}
			});
		});
	});

	// STEP 1: Identify nodes to delete, update and create
	const nodesToDelete: INode[] = [];
	const nodesToUpdate: { existing: INode; incoming: CreateNodeDto }[] = [];
	const nodesToCreate: { nodeUid: string; data: CreateNodeDto }[] = [];

	// Identify nodes to delete (exist but are not in the pipeline)
	existingNodes.forEach((existingNode) => {
		if (!incomingNodesMap.has(existingNode.nodeUid)) {
			nodesToDelete.push(existingNode);
		}
	});

	// Identify nodes to update or create
	incomingNodesMap.forEach((incomingNode, nodeUid) => {
		const existingNode = existingNodesMap.get(nodeUid);
		if (existingNode) {
			// Check if it needs updating
			const needsUpdate =
				existingNode.name !== incomingNode.name ||
				existingNode.x !== incomingNode.x ||
				existingNode.y !== incomingNode.y ||
				existingNode.numOutputs !== incomingNode.numOutputs ||
				existingNode.type !== incomingNode.type ||
				JSON.stringify(existingNode.settings) !== JSON.stringify(incomingNode.settings) ||
				existingNode.debug !== incomingNode.debug;

			if (needsUpdate) {
				nodesToUpdate.push({
					existing: existingNode,
					incoming: incomingNode,
				});
			}
		} else {
			nodesToCreate.push({ nodeUid, data: incomingNode });
		}
	});

	const nodesWithNumOutputsDecreased = new Map<number, CreateNodeDto>();
	// Check if any existing nodes have modified numOutputs
	nodesToUpdate.forEach((node) => {
		const incomingNode = node.incoming;
		const existingNodeData = node.existing;
		if (incomingNode.numOutputs < existingNodeData.numOutputs) {
			nodesWithNumOutputsDecreased.set(existingNodeData.id, incomingNode);
		}
	});

	// STEP 2: Identify wires to delete, update and create
	const wiresToDelete: IWire[] = [];
	const wiresToUpdate: { existing: IWire; incoming: IWireWithUidDto }[] = [];
	const wiresToCreate: { wireUid: string; data: IWireWithUidDto }[] = [];

	// Identify wires to delete
	existingWires.forEach((existingWire) => {
		if (!incomingWiresMap.has(existingWire.wireUid)) {
			const nodeIniId = existingWire.nodeIniId;
			const niniOutputIndex = existingWire.niniOutputIndex;

			const willBeDeletedByTrigger =
				nodesWithNumOutputsDecreased.has(nodeIniId) &&
				niniOutputIndex >= (nodesWithNumOutputsDecreased.get(nodeIniId)?.numOutputs || 0);

			if (!willBeDeletedByTrigger) {
				wiresToDelete.push(existingWire);
			}
		}
	});

	// Identify wires to update or create
	incomingWiresMap.forEach((incomingWire, wireUid) => {
		const existingWire = existingWiresMap.get(wireUid);
		if (existingWire) {
			// Check if it needs updating (compare by nodeUids since IDs can change)
			const existingNodeIni = existingNodes.find((n) => n.id === existingWire.nodeIniId);
			const existingNodeEnd = existingNodes.find((n) => n.id === existingWire.nodeEndId);

			const needsUpdate =
				existingNodeIni?.nodeUid !== incomingWire.nodeIniUid ||
				existingNodeEnd?.nodeUid !== incomingWire.nodeEndUid ||
				existingWire.niniOutputIndex !== incomingWire.niniOutputIndex;

			if (needsUpdate) {
				wiresToUpdate.push({
					existing: existingWire,
					incoming: incomingWire,
				});
			}
		} else {
			wiresToCreate.push({ wireUid, data: incomingWire });
		}
	});

	// STEP 3: Execute deletions (first wires, then nodes)
	if (wiresToDelete.length > 0) {
		const deleteWirePromises = wiresToDelete.map((wire) => deleteWireByPropName("id", wire.id));
		await Promise.all(deleteWirePromises);
	}

	if (nodesToDelete.length > 0) {
		const deleteNodePromises = nodesToDelete.map((node) => deleteNodeByPropName("id", node.id));
		await Promise.all(deleteNodePromises);
	}

	// STEP 4: Execute node updates and creations
	const updatedNodes = new Map<string, INode>();

	// Update existing nodes
	if (nodesToUpdate.length > 0) {
		const updateNodePromises = nodesToUpdate.map(async ({ existing, incoming }) => {
			const nodeData: INode = {
				id: existing.id,
				orgId: existing.orgId,
				groupId: existing.groupId,
				assetId: existing.assetId,
				nodeUid: existing.nodeUid,
				digitalTwinId: existing.digitalTwinId,
				name: incoming.name,
				x: incoming.x,
				y: incoming.y,
				numOutputs: incoming.numOutputs,
				type: incoming.type,
				settings: incoming.settings,
				debug: incoming.debug || "off",
			};
			const updatedNode = await updateNodeByPropName("id", existing.id, nodeData);
			return { nodeUid: existing.nodeUid, node: updatedNode };
		});

		const updateResults = await Promise.all(updateNodePromises);
		updateResults.forEach(({ nodeUid, node }) => {
			updatedNodes.set(nodeUid, node);
		});
	}

	// Create new nodes
	if (nodesToCreate.length > 0) {
		const createNodePromises = nodesToCreate.map(async ({ nodeUid, data }) => {
			const newNode = await createNewNode(data, groupId);
			return { nodeUid, node: newNode };
		});

		const createResults = await Promise.all(createNodePromises);
		createResults.forEach(({ nodeUid, node }) => {
			updatedNodes.set(nodeUid, node);
		});
	}

	// Add nodes that didn't change
	existingNodes.forEach((node) => {
		if (!updatedNodes.has(node.nodeUid) && incomingNodesMap.has(node.nodeUid)) {
			updatedNodes.set(node.nodeUid, node);
		}
	});

	// STEP 5: Execute wire updates and creations
	// Update existing wires
	if (wiresToUpdate.length > 0) {
		const updateWirePromises = wiresToUpdate.map(async ({ existing, incoming }) => {
			const nodeIniId = updatedNodes.get(incoming.nodeIniUid)?.id;
			const nodeEndId = updatedNodes.get(incoming.nodeEndUid)?.id;

			if (nodeIniId === undefined || nodeEndId === undefined) {
				throw new Error(`Missing node references for wire update ${incoming.wireUid}`);
			}

			const wireData: IWire = {
				id: existing.id,
				wireUid: existing.wireUid,
				nodeIniId,
				niniOutputIndex: incoming.niniOutputIndex,
				nodeEndId,
			};
			return await updateWireById(existing.id, wireData);
		});

		await Promise.all(updateWirePromises);
	}

	// Create new wires
	if (wiresToCreate.length > 0) {
		const createWirePromises = wiresToCreate.map(async ({ wireUid, data }) => {
			const nodeIniId = updatedNodes.get(data.nodeIniUid)?.id;
			const nodeEndId = updatedNodes.get(data.nodeEndUid)?.id;

			if (nodeIniId === undefined || nodeEndId === undefined) {
				throw new Error(`Missing node references for wire creation ${wireUid}`);
			}

			const newWire = {
				wireUid: data.wireUid,
				digitalTwinId,
				nodeIniId,
				niniOutputIndex: data.niniOutputIndex,
				nodeEndId,
			};

			return await createNewWire(newWire, groupId);
		});

		await Promise.all(createWirePromises);
	}

	const updatePipelineDto: PipelineFileDataDto = {
		pipelineFileName: pipelineData.pipelineFileName,
		pipelineFileLastModifDate: pipelineData.pipelineFileLastModifDate,
		pipelineFileData: JSON.stringify(pipelineData.nodes),
	};
	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto);

	const reinitialize = pipelineData.reinitialize || false;
	const context = {
		digitalTwinId,
		groupId,
		reinitialize,
	};
	await natsClient.jsPublish("pipeline_action", "restart", digitalTwinId, context);
};

export const deleteDigitalTwinPipeline = async (digitalTwinId: number, groupId: number): Promise<void> => {
	const reinitialize = false;
	const context = {
		digitalTwinId,
		groupId,
		reinitialize,
	};
	await natsClient.jsPublish("pipeline_action", "stop", digitalTwinId, context);

	const existingNodes = await getNodesByDigitalTwinId(digitalTwinId);
	const existingWires = await getWiresByDigitalTwinId(digitalTwinId);
	if (existingWires.length !== 0) {
		const deleteWirePromises = existingWires.map((wire) => deleteWireByPropName("id", wire.id));
		await Promise.all(deleteWirePromises);
	}

	if (existingNodes.length !== 0) {
		const deleteNodePromises = existingNodes.map((node) => deleteNodeByPropName("id", node.id));
		await Promise.all(deleteNodePromises);
	}

	const updatePipelineDto: PipelineFileDataDto = {
		pipelineFileName: "-",
		pipelineFileLastModifDate: "-",
		pipelineFileData: "",
	};
	await updateDigitalTwinPipelineFileDataById(digitalTwinId, groupId, updatePipelineDto);
};

export const applyPipelineAction = async (
	digitalTwinId: number,
	action: string,
	reinitialize: boolean,
	groupId: number
): Promise<void> => {
	if (!["start", "stop", "restart"].includes(action)) {
		throw new Error("Invalid action. Allowed actions are: start, stop, restart.");
	}

	const nodes = await getNodesByDigitalTwinId(digitalTwinId);
	if (nodes.length === 0) {
		throw new Error("No nodes found for the specified digital twin.");
	}

	const context = {
		groupId,
		digitalTwinId,
		reinitialize,
	};
	await natsClient.jsPublish("pipeline_action", action, digitalTwinId, context);
};
