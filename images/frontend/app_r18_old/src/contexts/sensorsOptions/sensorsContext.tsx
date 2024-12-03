import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { SensorsContextProps } from './interfaces'
import { initialState, SensorsReducer } from './sensorsReducer';


const SensorsStateContext = createContext<SensorsContextProps>(initialState);
const SensorsDispatchContext = createContext<any>({});

export function useSensorsDispatch() {
	const context = React.useContext(SensorsDispatchContext);
	if (context === undefined) {
		throw new Error('useSensorsDispatch must be used within a SensorsProvider');
	}

	return context;
}

export const SensorsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, sensorsDispatch] = useReducer(SensorsReducer, initialState);

	return (
		<SensorsStateContext.Provider value={user}>
			<SensorsDispatchContext.Provider value={sensorsDispatch}>
				{children}
			</SensorsDispatchContext.Provider>
		</SensorsStateContext.Provider>
	);
};

export const useSensorsOptionToShow = (): string => {
	const context = useContext(SensorsStateContext);
	if (context === undefined) {
		throw new Error('useSensorsOptionToShow must be used within a SensorsProvider');
	}
	return context.sensorsOptionToShow;
}

export const useSensorIdToEdit = (): number => {
	const context = useContext(SensorsStateContext);
	if (context === undefined) {
		throw new Error('useSensorIdToEdit must be used within a SensorsProvider');
	}
	return context.sensorIdToEdit;
}

export const useSensorRowIndexToEdit = (): number => {
	const context = useContext(SensorsStateContext);
	if (context === undefined) {
		throw new Error('useSensorRowIndexToEdit must be used within a SensorsProvider');
	}
	return context.sensorRowIndexToEdit;
}
