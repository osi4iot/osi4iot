import IGroup from "../group/interfaces/Group.interface";
import IDigitalTwin from "./digitalTwin.interface";
import { getMqttTopicsData } from "./digitalTwinDAL";
import { IMqttTopicDataShort } from "./digitalTwinGltfData.interface";
import PipelineNodeDto from "./pipelineNode.dto";

interface NodeConnections {
	listensTo: string[];
	publishesTo: string[];
}

export const areCyclesInPipeline = async (
	digitalTwin: IDigitalTwin,
	pipelineNodes: PipelineNodeDto[],
	group: IGroup,
): Promise<boolean> => {
	const mqttTopicsData = await getMqttTopicsData(group, digitalTwin);

	const topicGraph = new Map(); // topic -> Set of topics that can be reached
	const nodeConnections = new Map<string, NodeConnections>();
	const nodes = Object.assign([], pipelineNodes); // Ensure it's an array

	// First, extract all node connections
	extractNodeConnections(nodes, nodeConnections, mqttTopicsData);

	// Build the topic graph
	buildTopicGraph(nodes, nodeConnections, topicGraph);

	// Detect cycles
	const cycles = detectCycles(topicGraph);

	return cycles.length > 0;
};

const extractNodeConnections = (
	nodes: PipelineNodeDto[],
	nodeConnections: Map<any, any>,
	mqttTopicsData: IMqttTopicDataShort[]
) => {
	for (const node of nodes) {
		const nodeId = node.nodeUid;
		const connections: NodeConnections = { listensTo: [], publishesTo: [] };
		if (node.settings === "") continue;
		const settings = JSON.parse(node.settings) as Record<string, any>;
		if (typeof settings !== "object") continue;

		let topic = settings.topic;
		if (topic && topic !== "") {
			if (node.type === "Listen") {
				if (settings.listenTo === "Topic reference") {
					const topicData = mqttTopicsData.find((t) => t.topicRef === topic);
					if (topicData) {
						connections.listensTo.push(topicData.mqttTopic);
					}
				} else if (settings.listenTo === "Generic nats") {
					topic = topic.replace(/./g, "/");
					connections.listensTo.push(topic);
				} else if (settings.listenTo === "Generic mqtt") {
					connections.listensTo.push(topic);
				}
			} else if (node.type === "Publish") {
				if (settings.publishTo === "Topic reference") {
					const topicData = mqttTopicsData.find((t) => t.topicRef === topic);
					if (topicData) {
						connections.publishesTo.push(topicData.mqttTopic);
					}
				} else if (settings.publishTo === "Generic nats") {
					topic = topic.replace(/./g, "/");
					connections.publishesTo.push(topic);
				} else if (settings.publishTo === "Generic mqtt") {
					connections.publishesTo.push(topic);
				}
			}
		}

		nodeConnections.set(nodeId, connections);
	}
};

/**
 * Builds the directed topic graph based on node connections
 */
const buildTopicGraph = (
	nodes: PipelineNodeDto[],
	nodeConnections: Map<string, NodeConnections>,
	topicGraph: Map<string, Set<string>>
) => {
	// Create map from node to connected nodes
	const nodeToNodes = new Map();

	for (const node of nodes) {
		nodeToNodes.set(node.nodeUid, new Set());

		// Follow wire connections
		if (node.wires && node.wires.length > 0) {
			for (const wireGroup of node.wires) {
				for (const connection of wireGroup) {
					nodeToNodes.get(node.nodeUid).add(connection.nodeEndUid);
				}
			}
		}
	}

	// Build topic graph
	for (const [nodeId, connections] of nodeConnections) {
		const listenTopics = connections.listensTo;
		// const publishTopics = connections.publishesTo;

		// If this node listens to topics, we need to see what topics it can lead to
		if (listenTopics.length > 0) {
			for (const listenTopic of listenTopics) {
				const reachableTopics = findReachableTopics(nodeId, nodeToNodes, nodeConnections);

				if (!topicGraph.has(listenTopic)) {
					topicGraph.set(listenTopic, new Set());
				}

				// Add all topics reachable from this node
				for (const reachableTopic of reachableTopics) {
					topicGraph.get(listenTopic).add(reachableTopic);
				}
			}
		}
	}
};

/**
 * Finds all topics that can be reached from a given node
 */
const findReachableTopics = (
	startNodeId: string,
	nodeToNodes: Map<string, Set<string>>,
	nodeConnections: Map<string, NodeConnections>
): Set<string> => {
	const reachableTopics: Set<string> = new Set();
	const visited = new Set();
	const stack = [startNodeId];

	while (stack.length > 0) {
		const currentNode = stack.pop();

		if (visited.has(currentNode)) continue;
		visited.add(currentNode);

		// Get topics that this node publishes
		const connections = nodeConnections.get(currentNode);
		if (connections && connections.publishesTo.length > 0) {
			for (const topic of connections.publishesTo) {
				reachableTopics.add(topic);
			}
		}

		// Add connected nodes to stack
		const connectedNodes = nodeToNodes.get(currentNode);
		if (connectedNodes) {
			for (const connectedNode of connectedNodes) {
				if (!visited.has(connectedNode)) {
					stack.push(connectedNode);
				}
			}
		}
	}

	return reachableTopics;
};

/**
 * Detects cycles in the topic graph using DFS
 */
const detectCycles = (topicGraph: Map<string, Set<string>>) => {
	const cycles: string[][] | null = [];
	const visited: Set<string> = new Set();
	const recursionStack: Set<string> = new Set();

	for (const [topic] of topicGraph) {
		if (!visited.has(topic)) {
			const cycle = dfsDetectCycle(topic, visited, recursionStack, topicGraph, []);
			if (cycle) {
				cycles.push(cycle);
			}
		}
	}

	return cycles;
};

/**
 * DFS to detect cycles
 */
const dfsDetectCycle = (
	topic: string,
	visited: Set<string>,
	recursionStack: Set<string>,
	topicGraph: Map<string, Set<string>>,
	path: string[]
): string[] | null => {
	visited.add(topic);
	recursionStack.add(topic);
	path.push(topic);

	const neighbors = topicGraph.get(topic) || new Set();

	for (const neighbor of neighbors) {
		if (!visited.has(neighbor)) {
			const cycle = dfsDetectCycle(neighbor, visited, recursionStack, topicGraph, [...path]);
			if (cycle) return cycle;
		} else if (recursionStack.has(neighbor)) {
			// We found a cycle
			const cycleStart = path.indexOf(neighbor);
			return [...path.slice(cycleStart), neighbor];
		}
	}

	recursionStack.delete(topic);
	return null;
};

export const areThereInjectTopicsInPublish = (nodes: PipelineNodeDto[]): boolean => {
	for (const node of nodes) {
		if (node.type === "Publish") {
			if (node.settings === "") continue;
			const settings = JSON.parse(node.settings) as Record<string, any>;
			if (typeof settings !== "object" || settings.topic === "undefined" || settings.topic === "") continue;
			if (settings.topic.slice(0, 6) === "inject") {
				return true;
			}
		}
	}
	return false;
};