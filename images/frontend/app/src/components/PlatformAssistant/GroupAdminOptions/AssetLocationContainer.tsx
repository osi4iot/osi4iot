import { FC, useState } from 'react'
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IAsset } from '../TableColumns/assetsColumns';
import { useAssetBuildingId, useAssetGroupId } from '../../../contexts/assetsOptions';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import ElementLocationMap from '../Geolocation/ElementLocationMap';
import { IDevice } from '../TableColumns/devicesColumns';


interface AssetLocationContainerProps {
    buildings: IBuilding[];
    floors: IFloor[];
    groupsManaged: IGroupManaged[];
    assets: IAsset[];
    devices: IDevice[];
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshGroups: () => void;
    refreshAssets: () => void;
    refreshDevices: () => void;
    backToOption: () => void;
    setAssetLocationData: (assetLong: number, assetLat: number) => void;
}

const AssetLocationContainer: FC<AssetLocationContainerProps> = (
    {
        buildings,
        floors,
        groupsManaged,
        assets,
        devices,
        refreshBuildings,
        refreshFloors,
        refreshGroups,
        refreshAssets,
        refreshDevices,
        backToOption,
        setAssetLocationData
    }) => {
    const assetBuildingId = useAssetBuildingId();
    const building = buildings.filter(building => building.id === assetBuildingId)[0];
    const assetGroupId = useAssetGroupId();
    const groupManaged = groupsManaged.filter(group => group.id === assetGroupId)[0];
    const assetsInGroup = useState(assets.filter(asset => asset.groupId === assetGroupId))[0];
    const devicesInGroup = useState(devices.filter(devices => devices.groupId === assetGroupId))[0];
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
            assetsInGroup={assetsInGroup}
            devicesInGroup={devicesInGroup}
            featureIndex={featureIndex}
            refreshBuildings={refreshBuildings}
            refreshFloors={refreshFloors}
            refreshGroups={refreshGroups}
            refreshAssets={refreshAssets}
            refreshDevices={refreshDevices}
            setNewOuterBounds={setNewOuterBounds}
            backToOption={backToOption}
            setElementLocationData={setAssetLocationData}
        />
    )
}

export default AssetLocationContainer;