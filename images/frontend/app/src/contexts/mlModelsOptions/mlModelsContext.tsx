import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { MlModelsContextProps } from './interfaces'
import { initialState, MlModelsReducer } from './mlModelsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useMlModelsStore = createSectionStore(MlModelsReducer, initialState);

export function useMlModelsDispatch() {
	return useMlModelsStore.dispatch;
}

export const MlModelsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useMlModelsStore}>{children}</SectionStoreProvider>
);

export const useMlModelsOptionToShow = (): string => {
	return useMlModelsStore((state) => state.mlModelsOptionToShow);
}

export const useMlModelIdToEdit = (): number => {
	return useMlModelsStore((state) => state.mlModelIdToEdit);
}

export const useMlModelRowIndexToEdit = (): number => {
	return useMlModelsStore((state) => state.mlModelRowIndexToEdit);
}
