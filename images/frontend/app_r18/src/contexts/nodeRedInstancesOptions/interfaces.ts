export interface NodeRedInstancesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface NodeRedInstancesContextProps {
	nodeRedInstancesOptionToShow: string;
}

export interface NodeRedInstancesActionPayload {
	nodeRedInstancesOptionToShow: string;
}

export interface NodeRedInstancesAction {
	type: string;
	payload: NodeRedInstancesActionPayload;
	error: string;
}

export interface INodeRedInstancesOptionToShow {
	nodeRedInstancesOptionToShow: string;
}

