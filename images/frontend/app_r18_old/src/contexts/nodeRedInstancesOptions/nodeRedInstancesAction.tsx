import {
	NodeRedInstancesDispatch,
	INodeRedInstancesOptionToShow,
} from "./interfaces";


export function setNodeRedInstancesOptionToShow(nodeRedInstancesDispatch: NodeRedInstancesDispatch, data: INodeRedInstancesOptionToShow) {
	nodeRedInstancesDispatch({ type: "NODERED_INSTANCES_OPTION_TO_SHOW", payload: data });
}
