import { FC, useState } from 'react'
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IAsset } from '../TableColumns/assetsColumns';
import { useAssetBuildingId, useAssetGroupId } from '../../../contexts/assetsOptions';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import ElementLocationMap from '../Geolocation/ElementLocationMap';
import { IAssetType } from '../TableColumns/assetTypesColumns';


interface AssetLocationContainerProps {
    buildings: IBuilding[];
    floors: IFloor[];
    groupsManaged: IGroupManaged[];
    assetTypes: IAssetType[];
    assets: IAsset[];
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshGroups: () => void;
    refreshAssets: () => void;
    backToOption: () => void;
    setAssetLocationData: (assetLong: number, assetLat: number) => void;
}

const AssetLocationContainer: FC<AssetLocationContainerProps> = (
    {
        buildings,
        floors,
        groupsManaged,
        assetTypes,
        assets,
        refreshBuildings,
        refreshFloors,
        refreshGroups,
        refreshAssets,
        backToOption,
        setAssetLocationData
    }) => {
    const assetBuildingId = useAssetBuildingId();
    const building = buildings.filter(building => building.id === assetBuildingId)[0];
    const assetGroupId = useAssetGroupId();
    const groupManaged = groupsManaged.filter(group => group.id === assetGroupId)[0];
    const assetTypesInOrg = assetTypes.filter(assetType => assetType.orgId === groupManaged.orgId);
    const assetsInGroup = useState(assets.filter(asset => asset.groupId === assetGroupId))[0];
    const groupFloor = useState(floors.filter(floor =>
        floor.buildingId === assetBuildingId &&
        floor.floorNumber === groupManaged.floorNumber
    )[0])[0];
    const featureIndex = useState(groupManaged.featureIndex)[0];
    const [outerBounds, setOuterBounds] = useState(building.outerBounds);

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    }

    return (
        <ElementLocationMap
            elementToDrag={"asset"}
            outerBounds={outerBounds}
            building={building}
            floorData={groupFloor}
            groupManaged={groupManaged}
            assetTypes={assetTypesInOrg}
            assetsInGroup={assetsInGroup}
            featureIndex={featureIndex}
            refreshBuildings={refreshBuildings}
            refreshFloors={refreshFloors}
            refreshGroups={refreshGroups}
            refreshAssets={refreshAssets}
            setNewOuterBounds={setNewOuterBounds}
            backToOption={backToOption}
            setElementLocationData={setAssetLocationData}
        />
    )
}

export default AssetLocationContainer;