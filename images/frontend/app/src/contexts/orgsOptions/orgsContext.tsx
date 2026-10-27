import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { OrgsContextProps } from './interfaces'
import { initialState, OrgsReducer } from './orgsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useOrgsStore = createSectionStore(OrgsReducer, initialState);

export const OrgsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useOrgsStore}>{children}</SectionStoreProvider>
);

export function useOrgsDispatch() {
	return useOrgsStore.dispatch;
}

export const useOrgsOptionToShow = (): string => {
	return useOrgsStore((state) => state.orgsOptionToShow);
}

export const useOrgIdToEdit = (): number => {
	return useOrgsStore((state) => state.orgIdToEdit);
}

export const useOrgRowIndexToEdit = (): number => {
	return useOrgsStore((state) => state.orgRowIndexToEdit);
}
