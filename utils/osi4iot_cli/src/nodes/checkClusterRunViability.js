export default function (nodesData, organizations) {
    const numManagerNodes = nodesData.filter(node => node.nodeRole === "Manager").length;
    const numPlatformWorkerNodes = nodesData.filter(node => node.nodeRole === "Platform worker").length;
    const numGenericOrgWorkerNodes = nodesData.filter(node => node.nodeRole === "Generic org worker").length;
    const exclusiveOrgWorkerNodes = nodesData.filter(node => node.nodeRole === "Exclusive org worker").map(node => node.nodeHostName);
    const numNFSNodes = nodesData.filter(node => node.nodeRole === "NFS server").length;

    const warnings = [];
    if (nodesData.length === 1 && numManagerNodes !== 1) {
        warnings.push("- For only one node cluster a manager role is required.");
    }

    if (nodesData.length > 1) {
        if (!(numManagerNodes >= 1 && numPlatformWorkerNodes >= 1 && numGenericOrgWorkerNodes >= 1)) {
            warnings.push("- The minimum requirements for a multinode cluster are at least one manager node, one platform worker node and one generic org worker node.\n  But in order to get HA the recommended setting are three mananger nodes, three platform worker nodes and two generic org worker nodes");
        }

        if ((numManagerNodes > 1 || numPlatformWorkerNodes > 1 || numGenericOrgWorkerNodes > 1) && numNFSNodes === 0) {
            warnings.push("- For a multinode cluster an NFS node server is required.");
        }

        if (numManagerNodes % 2 === 0 || numManagerNodes > 7) {
            warnings.push("- An odd number of manager nodes less than or equal to seven is recommended. For example: 1, 3, 5 or 7.");
        }

        const exclusiveOrgWorkerNodesAvailability = true;
        for (const org of organizations) {
            if (org.exclusiveWorkerNodes.length !== 0) {
                for (const workerNodeName of org.exclusiveWorkerNodes) {
                    if (!exclusiveOrgWorkerNodes.includes(workerNodeName)) {
                        exclusiveOrgWorkerNodesAvailability = false
                    }
                }
            }
        }
        if (!exclusiveOrgWorkerNodesAvailability) {
            warnings.push("- There is not org worker nodes availability to deploy some org services.");
        }
    }

    return warnings;
}