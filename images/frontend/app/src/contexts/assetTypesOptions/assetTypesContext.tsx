import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { AssetTypesContextProps } from './interfaces'
import { initialState, AssetTypesReducer } from './assetTypesReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useAssetTypesStore = createSectionStore(AssetTypesReducer, initialState);

export function useAssetTypesDispatch() {
	return useAssetTypesStore.dispatch;
}

export const AssetTypesProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useAssetTypesStore}>{children}</SectionStoreProvider>
);

export const useAssetTypesOptionToShow = (): string => {
	return useAssetTypesStore((state) => state.assetTypesOptionToShow);
}

export const useAssetTypeIdToEdit = (): number => {
	return useAssetTypesStore((state) => state.assetTypeIdToEdit);
}

export const useAssetTypeRowIndexToEdit = (): number => {
	return useAssetTypesStore((state) => state.assetTypeRowIndexToEdit);
}
