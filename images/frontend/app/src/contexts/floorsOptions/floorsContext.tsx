import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { FloorsContextProps } from './interfaces'
import { initialState, FloorsReducer } from './floorsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useFloorsStore = createSectionStore(FloorsReducer, initialState);

export function useFloorsDispatch() {
	return useFloorsStore.dispatch;
}

export const FloorsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useFloorsStore}>{children}</SectionStoreProvider>
);

export const useFloorsOptionToShow = (): string => {
	return useFloorsStore((state) => state.floorsOptionToShow);
}

export const useFloorIdToEdit = (): number => {
	return useFloorsStore((state) => state.floorIdToEdit);
}

export const useFloorRowIndexToEdit = (): number => {
	return useFloorsStore((state) => state.floorRowIndexToEdit);
}
