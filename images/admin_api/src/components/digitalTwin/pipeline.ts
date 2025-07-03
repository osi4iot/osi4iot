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
import CreatePipelineDto from "./pipeline.dto";
import {
	createNewWire,
	deleteWireByPropName,
	getWireByPropName,
	getWiresByDigitalTwinId,
	updateWireById,
} from "../pipelines/wire/wireDAL";
import IWireWithUidDto from "../pipelines/wire/wireWithUid.inteface";

export const createDigitalTwinPipeline = async (
	digitalTwinId: number,
	pipelineData: CreatePipelineDto
): Promise<void> => {
	const existentNodes = await getNodesByDigitalTwinId(digitalTwinId);
	if (existentNodes.length > 0) {
		throw new Error("A pipeline already exists for this digital twin.");
	}

	const nodesData = new Map<string, CreateNodeDto>();
	const wiresData = new Map<string, IWireWithUidDto>();

	const pipelineNodes = pipelineData.nodes;
	pipelineNodes.forEach((node) => {
		if (!nodesData.has(node.nodeUid)) {
			const newNode: CreateNodeDto = {
				digitalTwinId,
				nodeUid: node.nodeUid,
				name: node.name,
				x: node.x,
				y: node.y,
				numOutputs: node.numOutputs,
				type: node.type,
				settings: node.settings,
			};
			nodesData.set(node.nodeUid, newNode);

			node.wires.forEach((wireArray, outputIndex) => {
				wireArray.forEach((wire) => {
					if (!wiresData.has(wire.wireUid)) {
						const newWire: IWireWithUidDto = {
							wireUid: wire.wireUid,
							nodeIniUid: node.nodeUid,
							niniOutputIndex: outputIndex,
							nodeEndUid: wire.nodeUid,
						};
						wiresData.set(wire.wireUid, newWire);
					}
				});
			});
		}
	});

	const nodes = new Map<string, INode>();
	const nodePromises = Array.from(nodesData.entries()).map(async ([nodeUid, pipelineNode]) => {
		let node: INode | null = await getNodeByPropName("node_uid", nodeUid);
		if (!node) {
			node = await createNewNode(pipelineNode);
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
				wireUid,
				nodeIniId,
				niniOutputIndex: wireData.niniOutputIndex,
				nodeEndId,
			};
			wire = await createNewWire(newWire);
		}
		return { wireUid, wire };
	});

	await Promise.all(wirePromises);
};

export const updateDigitalTwinPipeline = async (
	digitalTwinId: number,
	pipelineData: CreatePipelineDto
): Promise<void> => {
	// Get existing nodes and wires
	const existingNodes = await getNodesByDigitalTwinId(digitalTwinId);
	const existingWires = await getWiresByDigitalTwinId(digitalTwinId);

	// Create maps for easy access
	const existingNodesMap = new Map(existingNodes.map((node) => [node.nodeUid, node]));
	const existingWiresMap = new Map(existingWires.map((wire) => [wire.wireUid, wire]));

	// Process incoming pipeline data
	const incomingNodesMap = new Map<string, CreateNodeDto>();
	const incomingWiresMap = new Map<string, IWireWithUidDto>();

	// Extract nodes and wires from incoming pipeline
	pipelineData.nodes.forEach((node) => {
		if (!incomingNodesMap.has(node.nodeUid)) {
			const nodeData: CreateNodeDto = {
				digitalTwinId,
				nodeUid: node.nodeUid,
				name: node.name,
				x: node.x,
				y: node.y,
				numOutputs: node.numOutputs,
				type: node.type,
				settings: node.settings,
			};
			incomingNodesMap.set(node.nodeUid, nodeData);

			// Process wires for each node
			node.wires.forEach((wireArray, outputIndex) => {
				wireArray.forEach((wire) => {
					if (!incomingWiresMap.has(wire.wireUid)) {
						const wireData: IWireWithUidDto = {
							wireUid: wire.wireUid,
							nodeIniUid: node.nodeUid,
							niniOutputIndex: outputIndex,
							nodeEndUid: wire.nodeUid,
						};
						incomingWiresMap.set(wire.wireUid, wireData);
					}
				});
			});
		}
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
				JSON.stringify(existingNode.settings) !== JSON.stringify(incomingNode.settings);

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

	// STEP 2: Identify wires to delete, update and create
	const wiresToDelete: IWire[] = [];
	const wiresToUpdate: { existing: IWire; incoming: IWireWithUidDto }[] = [];
	const wiresToCreate: { wireUid: string; data: IWireWithUidDto }[] = [];

	// Identify wires to delete
	existingWires.forEach((existingWire) => {
		if (!incomingWiresMap.has(existingWire.wireUid)) {
			wiresToDelete.push(existingWire);
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
				nodeUid: existing.nodeUid,
				digitalTwinId: existing.digitalTwinId,
				name: incoming.name,
				x: incoming.x,
				y: incoming.y,
				numOutputs: incoming.numOutputs,
				type: incoming.type,
				settings: incoming.settings,
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
			const newNode = await createNewNode(data);
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
				nodeIniId,
				niniOutputIndex: data.niniOutputIndex,
				nodeEndId,
			};

			return await createNewWire(newWire);
		});

		await Promise.all(createWirePromises);
	}
};
