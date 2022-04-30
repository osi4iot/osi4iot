import { execSync } from 'child_process';

export default function (nodesDataIni) {
    const nodesData = nodesDataIni.filter(node => node.nodeRole !== "NFS server");
    for (const nodeData of nodesData) {
        const userName = nodeData.nodeUserName;
        const nodeIP = nodeData.nodeIP;
        const dockerHost = nodeIP === "localhost" ? "" : `-H ssh://${userName}@${nodeIP}`;
        execSync(`docker ${dockerHost} system prune --force`);
        execSync(`docker ${dockerHost} volume prune --force`);
    }
}