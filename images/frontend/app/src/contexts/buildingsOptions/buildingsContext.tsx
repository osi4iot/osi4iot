import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { BuildingsContextProps } from './interfaces'
import { initialState, BuildingsReducer } from './buildingsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useBuildingsStore = createSectionStore(BuildingsReducer, initialState);

export function useBuildingsDispatch() {
	return useBuildingsStore.dispatch;
}

export const BuildingsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useBuildingsStore}>{children}</SectionStoreProvider>
);

export const useBuildingsOptionToShow = (): string => {
	return useBuildingsStore((state) => state.buildingsOptionToShow);
}

export const useBuildingIdToEdit = (): number => {
	return useBuildingsStore((state) => state.buildingIdToEdit);
}

export const useBuildingRowIndexToEdit = (): number => {
	return useBuildingsStore((state) => state.buildingRowIndexToEdit);
}
