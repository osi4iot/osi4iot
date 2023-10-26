import React, { FC, useCallback } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { ASSETS_OPTIONS, ASSETS_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { Create_ASSETS_COLUMNS, IAsset } from '../TableColumns/assetsColumns';
import {
    setAssetsOptionToShow,
    useAssetsDispatch,
    useAssetsOptionToShow,
    useAssetsPreviousOption
} from '../../../contexts/assetsOptions';
import CreateAsset from './CreateAsset';
import EditAsset from './EditAsset';
import AssetLocationContainer from './AssetLocationContainer';
import {
    useBuildingsTable,
    useFloorsTable,
    useGroupsManagedTable
} from '../../../contexts/platformAssistantContext';
import { toast } from 'react-toastify';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { setAssetInputData } from '../../../contexts/assetsOptions/assetsAction';
import { useAssetInputData } from '../../../contexts/assetsOptions/assetsContext';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IAssetType } from '../TableColumns/assetTypesColumns';

interface AssetsContainerProps {
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    buildingsFiltered: IBuilding[];
    floorsFiltered: IFloor[];
    assetTypes: IAssetType[];
    assets: IAsset[];
    refreshAssets: () => void;
    refreshGroups: () => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
}

const AssetsContainer: FC<AssetsContainerProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    buildingsFiltered,
    floorsFiltered,
    assetTypes,
    assets,
    refreshAssets,
    refreshGroups,
    refreshBuildings,
    refreshFloors,
}) => {
    const assetsDispatch = useAssetsDispatch();
    const assetsOptionToShow = useAssetsOptionToShow();
    const previousOption = useAssetsPreviousOption();
    const buildingsTable = useBuildingsTable();
    const floorsTable = useFloorsTable();
    const groupsManagedTable = useGroupsManagedTable();
    const assetInputData = useAssetInputData();

    const showAssetsTableOption = () => {
        setAssetsOptionToShow(assetsDispatch, { assetsOptionToShow: ASSETS_OPTIONS.TABLE });
    }

    const backToOption = useCallback(() => {
        if (previousOption === ASSETS_PREVIOUS_OPTIONS.CREATE_ASSET) {
            setAssetsOptionToShow(assetsDispatch, { assetsOptionToShow: ASSETS_OPTIONS.CREATE_ASSET });
        } else if (previousOption === ASSETS_PREVIOUS_OPTIONS.EDIT_ASSET) {
            setAssetsOptionToShow(assetsDispatch, { assetsOptionToShow: ASSETS_OPTIONS.EDIT_ASSET });
        }
    }, [assetsDispatch, previousOption]);


    const showSelectLocationOption = useCallback(() => {
        if (buildingsFiltered.length !== 0 && floorsFiltered.length !== 0) {
            setAssetsOptionToShow(assetsDispatch, { assetsOptionToShow: ASSETS_OPTIONS.SELECT_LOCATION });
        } else {
            const warningMessage = "To select a location for the asset, building and floor geodata must be already entered"
            toast.warning(warningMessage);
        }
    }, [assetsDispatch, buildingsFiltered.length, floorsFiltered.length])

    const setAssetLocationData = (assetLong: number, assetLat: number) => {
        const newAssetInputData = { ...assetInputData };
        newAssetInputData.longitude = assetLong;
        newAssetInputData.latitude = assetLat;
        const assetInputFormData = { assetInputFormData: newAssetInputData };
        setAssetInputData(assetsDispatch, assetInputFormData);
    }

    return (
        <>
            {assetsOptionToShow === ASSETS_OPTIONS.CREATE_ASSET &&
                <CreateAsset
                    backToTable={showAssetsTableOption}
                    refreshAssets={refreshAssets}
                    orgsOfGroupManaged={orgsOfGroupManaged}
                    groupsManaged={groupsManaged}
                    assetTypes={assetTypes}
                    selectLocationOption={showSelectLocationOption}
                />
            }
            {assetsOptionToShow === ASSETS_OPTIONS.EDIT_ASSET &&
                <EditAsset
                    orgsOfGroupManaged={orgsOfGroupManaged}
                    groupsManaged={groupsManaged}
                    assetTypes={assetTypes}
                    assets={assets}
                    backToTable={showAssetsTableOption}
                    refreshAssets={refreshAssets}
                    selectLocationOption={showSelectLocationOption}
                />
            }
            {assetsOptionToShow === ASSETS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={assets}
                    columnsTable={Create_ASSETS_COLUMNS(orgsOfGroupManaged, groupsManaged, assetTypes, refreshAssets)}
                    componentName="asset"
                    reloadTable={refreshAssets}
                    createComponent={() => setAssetsOptionToShow(assetsDispatch, { assetsOptionToShow: ASSETS_OPTIONS.CREATE_ASSET })}
                />
            }
            {
                assetsOptionToShow === ASSETS_OPTIONS.SELECT_LOCATION &&
                <AssetLocationContainer
                    buildings={buildingsTable}
                    floors={floorsTable}
                    groupsManaged={groupsManagedTable}
                    assetTypes={assetTypes}
                    assets={assets}
                    refreshBuildings={refreshBuildings}
                    refreshFloors={refreshFloors}
                    refreshGroups={refreshGroups}
                    refreshAssets={refreshAssets}
                    backToOption={backToOption}
                    setAssetLocationData={setAssetLocationData}
                />
            }
        </>
    )
}

export default AssetsContainer;