import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { SensorTypesContextProps } from './interfaces'
import { initialState, SensorTypesReducer } from './sensorTypesReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useSensorTypesStore = createSectionStore(SensorTypesReducer, initialState);

export function useSensorTypesDispatch() {
	return useSensorTypesStore.dispatch;
}

export const SensorTypesProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useSensorTypesStore}>{children}</SectionStoreProvider>
);

export const useSensorTypesOptionToShow = (): string => {
	return useSensorTypesStore((state) => state.sensorTypesOptionToShow);
}

export const useSensorTypeIdToEdit = (): number => {
	return useSensorTypesStore((state) => state.sensorTypeIdToEdit);
}

export const useSensorTypeRowIndexToEdit = (): number => {
	return useSensorTypesStore((state) => state.sensorTypeRowIndexToEdit);
}
