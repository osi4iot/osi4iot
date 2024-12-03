import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { MlModelsContextProps } from './interfaces'
import { initialState, MlModelsReducer } from './mlModelsReducer';


const MlModelsStateContext = createContext<MlModelsContextProps>(initialState);
const MlModelsDispatchContext = createContext<any>({});

export function useMlModelsDispatch() {
	const context = React.useContext(MlModelsDispatchContext);
	if (context === undefined) {
		throw new Error('useMlModelsDispatch must be used within a MlModelsProvider');
	}

	return context;
}

export const MlModelsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, mlModelsDispatch] = useReducer(MlModelsReducer, initialState);

	return (
		<MlModelsStateContext.Provider value={user}>
			<MlModelsDispatchContext.Provider value={mlModelsDispatch}>
				{children}
			</MlModelsDispatchContext.Provider>
		</MlModelsStateContext.Provider>
	);
};


export const useMlModelsOptionToShow = (): string => {
	const context = useContext(MlModelsStateContext);
	if (context === undefined) {
		throw new Error('useMlModelsOptionToShow must be used within a MlModelsProvider');
	}
	return context.mlModelsOptionToShow;
}

export const useMlModelIdToEdit = (): number => {
	const context = useContext(MlModelsStateContext);
	if (context === undefined) {
		throw new Error('useMlModelIdToEdit must be used within a MlModelsProvider');
	}
	return context.mlModelIdToEdit;
}

export const useMlModelRowIndexToEdit = (): number => {
	const context = useContext(MlModelsStateContext);
	if (context === undefined) {
		throw new Error('useMlModelRowIndexToEdit must be used within a MlModelsProvider');
	}
	return context.mlModelRowIndexToEdit;
}