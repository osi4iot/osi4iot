import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { AssetTypesContextProps } from './interfaces'
import { initialState, AssetTypesReducer } from './assetTypesReducer';

const AssetTypesStateContext = createContext<AssetTypesContextProps>(initialState);
const AssetTypesDispatchContext = createContext<any>({});

export function useAssetTypesDispatch() {
	const context = React.useContext(AssetTypesDispatchContext);
	if (context === undefined) {
		throw new Error('useAssetTypesDispatch must be used within a AssetTypesProvider');
	}

	return context;
}

export const AssetTypesProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, assetTypesDispatch] = useReducer(AssetTypesReducer, initialState);

	return (
		<AssetTypesStateContext.Provider value={user}>
			<AssetTypesDispatchContext.Provider value={assetTypesDispatch}>
				{children}
			</AssetTypesDispatchContext.Provider>
		</AssetTypesStateContext.Provider>
	);
};


export const useAssetTypesOptionToShow = (): string => {
	const context = useContext(AssetTypesStateContext);
	if (context === undefined) {
		throw new Error('useAssetTypesOptionToShow must be used within a AssetTypesProvider');
	}
	return context.assetTypesOptionToShow;
}

export const useAssetTypeIdToEdit = (): number => {
	const context = useContext(AssetTypesStateContext);
	if (context === undefined) {
		throw new Error('useAssetTypeIdToEdit must be used within a AssetTypesProvider');
	}
	return context.assetTypeIdToEdit;
}

export const useAssetTypeRowIndexToEdit = (): number => {
	const context = useContext(AssetTypesStateContext);
	if (context === undefined) {
		throw new Error('useAssetTypeRowIndexToEdit must be used within a AssetTypesProvider');
	}
	return context.assetTypeRowIndexToEdit;
}