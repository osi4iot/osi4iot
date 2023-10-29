import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { FloorsContextProps } from './interfaces'
import { initialState, FloorsReducer } from './floorsReducer';


const FloorsStateContext = createContext<FloorsContextProps>(initialState);
const FloorsDispatchContext = createContext<any>({});


export function useFloorsDispatch() {
	const context = React.useContext(FloorsDispatchContext);
	if (context === undefined) {
		throw new Error('useFloorsDispatch must be used within a FloorsProvider');
	}

	return context;
}

export const FloorsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, floorsDispatch] = useReducer(FloorsReducer, initialState);

	return (
		<FloorsStateContext.Provider value={user}>
			<FloorsDispatchContext.Provider value={floorsDispatch}>
				{children}
			</FloorsDispatchContext.Provider>
		</FloorsStateContext.Provider>
	);
};


export const useFloorsOptionToShow = (): string => {
	const context = useContext(FloorsStateContext);
	if (context === undefined) {
		throw new Error('useFloorsOptionToShow must be used within a FloorsProvider');
	}
	return context.floorsOptionToShow;
}

export const useFloorIdToEdit = (): number => {
	const context = useContext(FloorsStateContext);
	if (context === undefined) {
		throw new Error('useFloorIdToEdit must be used within a FloorsProvider');
	}
	return context.floorIdToEdit;
}

export const useFloorRowIndexToEdit = (): number => {
	const context = useContext(FloorsStateContext);
	if (context === undefined) {
		throw new Error('useFloorRowIndexToEdit must be used within a FloorsProvider');
	}
	return context.floorRowIndexToEdit;
}
