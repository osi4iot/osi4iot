import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { MeasurementsContextProps } from './interfaces'
import { initialState, MeasurementsReducer } from './measurementsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useMeasurementsStore = createSectionStore(MeasurementsReducer, initialState);

export function useMeasurementsDispatch() {
	return useMeasurementsStore.dispatch;
}

export const MeasurementsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useMeasurementsStore}>{children}</SectionStoreProvider>
);

export const useMeasurementsOptionToShow = (): string => {
	return useMeasurementsStore((state) => state.measurementsOptionToShow);
}

export const useMeasurementTimestampToEdit = (): number => {
	return useMeasurementsStore((state) => state.measurementTimestampToEdit);
}

export const useMeasurementRowIndexToEdit = (): number => {
	return useMeasurementsStore((state) => state.measurementRowIndexToEdit);
}
