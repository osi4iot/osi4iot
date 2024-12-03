import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { MeasurementsContextProps } from './interfaces'
import { initialState, MeasurementsReducer } from './measurementsReducer';


const MeasurementsStateContext = createContext<MeasurementsContextProps>(initialState);
const MeasurementsDispatchContext = createContext<any>({});


export function useMeasurementsDispatch() {
	const context = React.useContext(MeasurementsDispatchContext);
	if (context === undefined) {
		throw new Error('useMeasurementsDispatch must be used within aMeasurementsProvider');
	}

	return context;
}

export const MeasurementsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, measurementsDispatch] = useReducer(MeasurementsReducer, initialState);

	return (
		<MeasurementsStateContext.Provider value={user}>
			<MeasurementsDispatchContext.Provider value={measurementsDispatch}>
				{children}
			</MeasurementsDispatchContext.Provider>
		</MeasurementsStateContext.Provider>
	);
};


export const useMeasurementsOptionToShow = (): string => {
	const context = useContext(MeasurementsStateContext);
	if (context === undefined) {
		throw new Error('useMeasurementsOptionToShow must be used within a MeasurementsProvider');
	}
	return context.measurementsOptionToShow;
}

export const useMeasurementTimestampToEdit = (): number => {
	const context = useContext(MeasurementsStateContext);
	if (context === undefined) {
		throw new Error('useMeasurementTimestampToEdit must be used within a MeasurementsProvider');
	}
	return context.measurementTimestampToEdit;
}

export const useMeasurementRowIndexToEdit = (): number => {
	const context = useContext(MeasurementsStateContext);
	if (context === undefined) {
		throw new Error('useMeasurementRowIndexToEdit must be used within a MeasurementsProvider');
	}
	return context.measurementRowIndexToEdit;
}
