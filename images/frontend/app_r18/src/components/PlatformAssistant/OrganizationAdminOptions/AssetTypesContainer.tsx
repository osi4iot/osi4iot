import React, { FC, useCallback } from 'react';
import TableWithPagination from '../Utils/TableWithPagination';
import { ASSET_TYPES_OPTIONS } from '../Utils/platformAssistantOptions';
import { Create_ASSET_TYPES_COLUMNS, IAssetType } from '../TableColumns/assetTypesColumns';
import { setAssetTypesOptionToShow, useAssetTypesDispatch, useAssetTypesOptionToShow } from '../../../contexts/assetTypesOptions';
import CreateAssetType from './CreateAssetType';
import EditAssetType from './EditAssetType';
import { useOrgsManagedTable } from '../../../contexts/platformAssistantContext';

interface AssetTypesContainerProps {
    assetTypes: IAssetType[];
    refreshAssetTypes: () => void;
}

const AssetTypesContainer: FC<AssetTypesContainerProps> = ({
    assetTypes,
    refreshAssetTypes
}) => {
    const assetTypesDispatch = useAssetTypesDispatch();
    const assetTypesOptionToShow = useAssetTypesOptionToShow();
    const orgsManagedTable = useOrgsManagedTable();

    const showAssetTypesTableOption = useCallback(() => {
        setAssetTypesOptionToShow(assetTypesDispatch, { assetTypesOptionToShow: ASSET_TYPES_OPTIONS.TABLE });
    }, [assetTypesDispatch]);

    return (
        <>

            {assetTypesOptionToShow === ASSET_TYPES_OPTIONS.CREATE_ASSET_TYPE &&
                <CreateAssetType
                    orgsManagedTable={orgsManagedTable}
                    backToTable={showAssetTypesTableOption}
                    refreshAssetTypes={refreshAssetTypes}
                />
            }
            {assetTypesOptionToShow === ASSET_TYPES_OPTIONS.EDIT_ASSET_TYPE &&
                <EditAssetType
                    orgsManagedTable={orgsManagedTable}
                    assetTypes={assetTypes}
                    backToTable={showAssetTypesTableOption}
                    refreshAssetTypes={refreshAssetTypes}
                />
            }
            {assetTypesOptionToShow === ASSET_TYPES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={assetTypes}
                    columnsTable={Create_ASSET_TYPES_COLUMNS(refreshAssetTypes)}
                    componentName="asset type"
                    reloadTable={refreshAssetTypes}
                    createComponent={() =>
                        setAssetTypesOptionToShow(
                            assetTypesDispatch,
                            { assetTypesOptionToShow: ASSET_TYPES_OPTIONS.CREATE_ASSET_TYPE })
                    }
                />
            }
        </>
    )
}

export default AssetTypesContainer;
