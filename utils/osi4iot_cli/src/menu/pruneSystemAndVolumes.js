import { execSync } from 'child_process';
import isLocahostNode from "../nodes/isLocalhostNode.js";

export default function (nodesData) {
    for (const nodeData of nodesData) {
        const userName = nodeData.nodeUserName;
        const nodeIP = nodeData.nodeIP;
        const dockerHost = isLocahostNode(nodeIP) ? "" : `-H ssh://${userName}@${nodeIP}`;
        execSync(`docker ${dockerHost} system prune --force`);
        execSync(`docker ${dockerHost} volume prune --force`);
    }
}