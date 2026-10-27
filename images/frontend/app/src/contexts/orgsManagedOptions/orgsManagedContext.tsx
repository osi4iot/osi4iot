import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { OrgsManagedContextProps } from './interfaces'
import { initialState, OrgsManagedReducer } from './orgsManagedReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useOrgsManagedStore = createSectionStore(OrgsManagedReducer, initialState);

export function useOrgsManagedState() {
	return useOrgsManagedStore();
}

export const OrgsManagedProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useOrgsManagedStore}>{children}</SectionStoreProvider>
);

export function useOrgsManagedDispatch() {
	return useOrgsManagedStore.dispatch;
}

export const useOrgsManagedOptionToShow = (): string => {
	return useOrgsManagedStore((state) => state.orgsManagedOptionToShow);
};

export const useOrgManagedIdToCreateOrgUsers = (): number => {
	return useOrgsManagedStore((state) => state.orgManagedIdToCreateOrgUsers);
};

export const useOrgManagedIdToRemoveAllOrgUsers = (): number => {
	return useOrgsManagedStore((state) => state.orgManagedIdToRemoveAllOrgUsers);
};

export const useOrgManagedRowIndex = (): number => {
	return useOrgsManagedStore((state) => state.orgManagedRowIndex);
};
