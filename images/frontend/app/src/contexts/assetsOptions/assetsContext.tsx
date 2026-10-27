import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { AssetsContextProps, IAssetInputData } from './interfaces'
import { initialState, AssetsReducer } from './assetsReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useAssetsStore = createSectionStore(AssetsReducer, initialState);

export function useAssetsDispatch() {
	return useAssetsStore.dispatch;
}

export const AssetsProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useAssetsStore}>{children}</SectionStoreProvider>
);

export const useAssetsOptionToShow = (): string => {
	return useAssetsStore((state) => state.assetsOptionToShow);
}

export const useAssetsPreviousOption = (): string => {
	return useAssetsStore((state) => state.assetsPreviousOption);
}

export const useAssetIdToEdit = (): number => {
	return useAssetsStore((state) => state.assetIdToEdit);
}

export const useAssetRowIndexToEdit = (): number => {
	return useAssetsStore((state) => state.assetRowIndexToEdit);
}

export const useAssetBuildingId = (): number => {
	return useAssetsStore((state) => state.assetBuildingId);
}

export const useAssetGroupId = (): number => {
	return useAssetsStore((state) => state.assetGroupId);
}

export const useAssetInputData = (): IAssetInputData => {
	return useAssetsStore((state) => state.assetInputFormData);
}
