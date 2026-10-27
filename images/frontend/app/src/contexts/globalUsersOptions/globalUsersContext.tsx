import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { GlobalUsersContextProps } from './interfaces'
import { initialState, GlobalUsersReducer } from './globalUsersReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useGlobalUsersStore = createSectionStore(GlobalUsersReducer, initialState);

export function useGlobalUsersDispatch() {
	return useGlobalUsersStore.dispatch;
}

export const GlobalUsersProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useGlobalUsersStore}>{children}</SectionStoreProvider>
);

export const useGlobalUsersOptionToShow = (): string => {
	return useGlobalUsersStore((state) => state.globalUsersOptionToShow);
}

export const useGlobalUserIdToEdit = (): number => {
	return useGlobalUsersStore((state) => state.globalUserIdToEdit);
}

export const useGlobalUserRowIndexToEdit = (): number => {
	return useGlobalUsersStore((state) => state.globalUserRowIndexToEdit);
}
