import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { SensorTypesContextProps } from './interfaces'
import { initialState, SensorTypesReducer } from './sensorTypesReducer';

const SensorTypesStateContext = createContext<SensorTypesContextProps>(initialState);
const SensorTypesDispatchContext = createContext<any>({});

export function useSensorTypesDispatch() {
	const context = React.useContext(SensorTypesDispatchContext);
	if (context === undefined) {
		throw new Error('useSensorTypesDispatch must be used within a SensorTypesProvider');
	}

	return context;
}

export const SensorTypesProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, sensorTypesDispatch] = useReducer(SensorTypesReducer, initialState);

	return (
		<SensorTypesStateContext.Provider value={user}>
			<SensorTypesDispatchContext.Provider value={sensorTypesDispatch}>
				{children}
			</SensorTypesDispatchContext.Provider>
		</SensorTypesStateContext.Provider>
	);
};


export const useSensorTypesOptionToShow = (): string => {
	const context = useContext(SensorTypesStateContext);
	if (context === undefined) {
		throw new Error('useSensorTypesOptionToShow must be used within a SensorTypesProvider');
	}
	return context.sensorTypesOptionToShow;
}

export const useSensorTypeIdToEdit = (): number => {
	const context = useContext(SensorTypesStateContext);
	if (context === undefined) {
		throw new Error('useSensorTypeIdToEdit must be used within a SensorTypesProvider');
	}
	return context.sensorTypeIdToEdit;
}

export const useSensorTypeRowIndexToEdit = (): number => {
	const context = useContext(SensorTypesStateContext);
	if (context === undefined) {
		throw new Error('useSensorTypeRowIndexToEdit must be used within a SensorTypesProvider');
	}
	return context.sensorTypeRowIndexToEdit;
}