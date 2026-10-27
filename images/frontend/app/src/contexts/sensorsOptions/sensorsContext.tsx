import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { SensorsContextProps } from './interfaces'
import { initialState, SensorsReducer } from './sensorsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useSensorsStore = createSectionStore(SensorsReducer, initialState);

export function useSensorsDispatch() {
	return useSensorsStore.dispatch;
}

export const SensorsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useSensorsStore}>{children}</SectionStoreProvider>
);

export const useSensorsOptionToShow = (): string => {
	return useSensorsStore((state) => state.sensorsOptionToShow);
}

export const useSensorIdToEdit = (): number => {
	return useSensorsStore((state) => state.sensorIdToEdit);
}

export const useSensorRowIndexToEdit = (): number => {
	return useSensorsStore((state) => state.sensorRowIndexToEdit);
}
