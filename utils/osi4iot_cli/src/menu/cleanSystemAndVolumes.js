import { execSync } from 'child_process';
import isLocahostNode from '../nodes/isLocalhostNode';

export default function (nodesDataIni) {
    const nodesData = nodesDataIni.filter(node => node.nodeRole !== "NFS server");
    for (const nodeData of nodesData) {
        const userName = nodeData.nodeUserName;
        const nodeIP = nodeData.nodeIP;
        const dockerHost = isLocahostNode(nodeIP) ? "" : `-H ssh://${userName}@${nodeIP}`;
        try {
            execSync(`docker ${dockerHost} image rm $(docker ${dockerHost} image ls -q) --force`, { stdio: 'ignore' });
        } catch (err) {
            //do nothing
        }

        try {
            execSync(`docker ${dockerHost} image network $(docker ${dockerHost} network ls -q) --force`, { stdio: 'ignore' });
        } catch (err) {
            //do nothing
        }

        try {
            execSync(`docker ${dockerHost} volume rm $(docker ${dockerHost} volume ls -q) --force`, { stdio: 'ignore' });
        } catch (err) {
            //do nothing
        }
    }
}