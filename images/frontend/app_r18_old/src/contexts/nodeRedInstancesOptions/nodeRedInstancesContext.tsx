import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { NodeRedInstancesContextProps } from './interfaces'
import { initialState, NodeRedInstancesReducer } from './nodeRedInstancesReducer';


const NodeRedInstancesStateContext = createContext<NodeRedInstancesContextProps>(initialState);
const NodeRedInstancesDispatchContext = createContext<any>({});


export function useNodeRedInstancesDispatch() {
	const context = React.useContext(NodeRedInstancesDispatchContext);
	if (context === undefined) {
		throw new Error('useNodeRedInstancesDispatch must be used within a NodeRedInstancesProvider');
	}

	return context;
}

export const NodeRedInstancesProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, nodeRedInstancesDispatch] = useReducer(NodeRedInstancesReducer, initialState);

	return (
		<NodeRedInstancesStateContext.Provider value={user}>
			<NodeRedInstancesDispatchContext.Provider value={nodeRedInstancesDispatch}>
				{children}
			</NodeRedInstancesDispatchContext.Provider>
		</NodeRedInstancesStateContext.Provider>
	);
};


export const useNodeRedInstancesOptionToShow = (): string => {
	const context = useContext(NodeRedInstancesStateContext);
	if (context === undefined) {
		throw new Error('useNodeRedInstancesOptionToShow must be used within a NodeRedInstancesProvider');
	}
	return context.nodeRedInstancesOptionToShow;
}

