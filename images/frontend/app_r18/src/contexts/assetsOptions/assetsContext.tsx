import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { AssetsContextProps, IAssetInputData } from './interfaces'
import { initialState, AssetsReducer } from './assetsReducer';

const AssetsStateContext = createContext<AssetsContextProps>(initialState);
const AssetsDispatchContext = createContext<any>({});

export function useAssetsDispatch() {
	const context = React.useContext(AssetsDispatchContext);
	if (context === undefined) {
		throw new Error('useAssetsDispatch must be used within a AssetsProvider');
	}

	return context;
}

export const AssetsProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, assetsDispatch] = useReducer(AssetsReducer, initialState);

	return (
		<AssetsStateContext.Provider value={user}>
			<AssetsDispatchContext.Provider value={assetsDispatch}>
				{children}
			</AssetsDispatchContext.Provider>
		</AssetsStateContext.Provider>
	);
};

export const useAssetsOptionToShow = (): string => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetsOptionToShow must be used within a AssetsProvider');
	}
	return context.assetsOptionToShow;
}

export const useAssetsPreviousOption = (): string => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetsPreviousOption must be used within a AssetsProvider');
	}
	return context.assetsPreviousOption;
}

export const useAssetIdToEdit = (): number => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetIdToEdit must be used within a AssetsProvider');
	}
	return context.assetIdToEdit;
}

export const useAssetRowIndexToEdit = (): number => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetRowIndexToEdit must be used within a AssetsProvider');
	}
	return context.assetRowIndexToEdit;
}

export const useAssetBuildingId = (): number => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetBuildingId must be used within a AssetsProvider');
	}
	return context.assetBuildingId;
}

export const useAssetGroupId = (): number => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetGroupId must be used within a AssetsProvider');
	}
	return context.assetGroupId;
}

export const useAssetInputData = (): IAssetInputData => {
	const context = useContext(AssetsStateContext);
	if (context === undefined) {
		throw new Error('useAssetInputData must be used within a AssetsProvider');
	}
	return context.assetInputFormData;
}


