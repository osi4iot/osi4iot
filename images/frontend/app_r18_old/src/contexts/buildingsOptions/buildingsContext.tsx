import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { BuildingsContextProps } from './interfaces'
import { initialState, BuildingsReducer } from './buildingsReducer';


const BuildingsStateContext = createContext<BuildingsContextProps>(initialState);
const BuildingsDispatchContext = createContext<any>({});


export function useBuildingsDispatch() {
	const context = React.useContext(BuildingsDispatchContext);
	if (context === undefined) {
		throw new Error('useBuildingsDispatch must be used within a BuildingsProvider');
	}

	return context;
}

export const BuildingsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, buildingsDispatch] = useReducer(BuildingsReducer, initialState);

	return (
		<BuildingsStateContext.Provider value={user}>
			<BuildingsDispatchContext.Provider value={buildingsDispatch}>
				{children}
			</BuildingsDispatchContext.Provider>
		</BuildingsStateContext.Provider>
	);
};


export const useBuildingsOptionToShow = (): string => {
	const context = useContext(BuildingsStateContext);
	if (context === undefined) {
		throw new Error('useBuildingsOptionToShow must be used within a BuildingsProvider');
	}
	return context.buildingsOptionToShow;
}

export const useBuildingIdToEdit = (): number => {
	const context = useContext(BuildingsStateContext);
	if (context === undefined) {
		throw new Error('useBuildingIdToEdit must be used within a BuildingsProvider');
	}
	return context.buildingIdToEdit;
}

export const useBuildingRowIndexToEdit = (): number => {
	const context = useContext(BuildingsStateContext);
	if (context === undefined) {
		throw new Error('useBuildingRowIndexToEdit must be used within a BuildingsProvider');
	}
	return context.buildingRowIndexToEdit;
}
