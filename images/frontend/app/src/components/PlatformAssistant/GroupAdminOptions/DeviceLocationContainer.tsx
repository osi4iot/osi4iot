import { FC, useState } from 'react'
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IDevice } from '../TableColumns/devicesColumns';
import { useDeviceBuildingId, useDeviceGroupId } from '../../../contexts/devicesOptions';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import ElementLocationMap from '../Geolocation/ElementLocationMap';
import { IAsset } from '../TableColumns/assetsColumns';


interface DeviceLocationContainerProps {
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
    setDeviceLocationData: (deviceLong: number, deviceLat: number) => void;
}

const DeviceLocationContainer: FC<DeviceLocationContainerProps> = (
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
        setDeviceLocationData
    }) => {
    const deviceBuildingId = useDeviceBuildingId();
    const building = buildings.filter(building => building.id === deviceBuildingId)[0];
    const deviceGroupId = useDeviceGroupId();
    const groupManaged = groupsManaged.filter(group => group.id === deviceGroupId)[0];
    const assetsInGroup = useState(assets.filter(asset => asset.groupId === deviceGroupId))[0];
    const devicesInGroup = useState(devices.filter(device => device.groupId === deviceGroupId))[0];
    const groupFloor = useState(floors.filter(floor =>
        floor.buildingId === deviceBuildingId &&
        floor.floorNumber === groupManaged.floorNumber
    )[0])[0];
    const featureIndex = useState(groupManaged.featureIndex)[0];
    const [outerBounds, setOuterBounds] = useState(building.outerBounds);

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    }

    return (
        <ElementLocationMap
            elementToDrag={"device"}
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
            setElementLocationData={setDeviceLocationData}
        />
    )
}

export default DeviceLocationContainer;