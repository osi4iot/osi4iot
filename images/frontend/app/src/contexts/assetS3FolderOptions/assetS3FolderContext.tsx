import { FC } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { initialState, AssetS3FolderReducer } from './assetS3FolderReducer';
import { createSectionStore, SectionStoreProvider } from '../../state/createSectionStore';
import { AssetS3FolderContextProps } from './interfaces';

// Estado de la sección en un almacén Zustand global (antes Context + useReducer): se conserva al cambiar de capa
const useAssetS3FolderStore = createSectionStore(AssetS3FolderReducer, initialState);

export function useAssetS3FolderDispatch() {
	return useAssetS3FolderStore.dispatch;
}

export const AssetS3FolderProvider: FC<ChildrenProp> = ({ children }) => (
	<SectionStoreProvider store={useAssetS3FolderStore}>{children}</SectionStoreProvider>
);

export const useAssetS3FolderOptionToShow = (): string => {
	return useAssetS3FolderStore((state) => state.assetS3FolderOptionToShow);
}

export const useAssetS3FoldersIdToEdit = (): number => {
	return useAssetS3FolderStore((state) => state.assetS3FolderIdToEdit);
}

export const useAssetS3FoldersRowIndexToEdit = (): number => {
	return useAssetS3FolderStore((state) => state.assetS3FolderRowIndexToEdit);
}
