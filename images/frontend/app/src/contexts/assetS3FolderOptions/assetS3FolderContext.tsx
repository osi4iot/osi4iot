import React, { createContext, FC, useContext, useReducer } from 'react';
import { ChildrenProp } from '../../interfaces/interfaces'
import { initialState, AssetS3FolderReducer } from './assetS3FolderReducer';
import { AssetS3FolderContextProps } from './interfaces';

const AssetS3FolderStateContext = createContext<AssetS3FolderContextProps>(initialState);
const AssetS3FolderDispatchContext = createContext<any>({});

export function useAssetS3FolderDispatch() {
    const context = React.useContext(AssetS3FolderDispatchContext);
    if (context === undefined) {
        throw new Error('useAssetS3FolderDispatch must be used within a AssetS3FolderProvider');
    }

    return context;
}

export const AssetS3FolderProvider: FC<ChildrenProp> = ({ children }) => {
    const [user, assetS3FolderDispatch] = useReducer(AssetS3FolderReducer, initialState);

    return (
        <AssetS3FolderStateContext.Provider value={user}>
             <AssetS3FolderDispatchContext.Provider value={assetS3FolderDispatch}>
                {children}
            </AssetS3FolderDispatchContext.Provider>
        </AssetS3FolderStateContext.Provider>
    );
};

export const useAssetS3FolderOptionToShow = (): string => {
    const context = useContext(AssetS3FolderStateContext);
    if (context === undefined) {
        throw new Error('useAssetS3FolderOptionToShow must be used within a AssetS3FolderProvider');
    }
    return context.assetS3FolderOptionToShow;
}

export const useAssetS3FoldersIdToEdit = (): number => {
    const context = useContext(AssetS3FolderStateContext);
    if (context === undefined) {
        throw new Error('useAssetS3FoldersIdToEdit must be used within a AssetS3FolderProvider');
    }
    return context.assetS3FolderIdToEdit;
}

export const useAssetS3FoldersRowIndexToEdit = (): number => {
    const context = useContext(AssetS3FolderStateContext);
    if (context === undefined) {
        throw new Error('useAssetS3FoldersRowIndexToEdit must be used within a AssetS3FolderProvider');
    }
    return context.assetS3FolderRowIndexToEdit;
}
