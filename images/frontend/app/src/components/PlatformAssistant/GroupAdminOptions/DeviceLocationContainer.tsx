import { FC, useState } from 'react'
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import DeviceLocationMap from '../Geolocation/DeviceLocationMap';
import { IDevice } from '../TableColumns/devicesColumns';
import { useDeviceBuildingId, useDeviceGroupId } from '../../../contexts/devicesOptions';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';



interface DeviceLocationContainerProps {
    buildings: IBuilding[];
    floors: IFloor[];
    groups: IGroupManaged[];
    devices: IDevice[];
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshGroups: () => void;
    refreshDevices: () => void;
    backToOption: () => void;
    setDeviceLocationData: (deviceLong: number, deviceLat: number) => void;
}

const DeviceLocationContainer: FC<DeviceLocationContainerProps> = (
    {
        buildings,
        floors,
        groups,
        devices,
        refreshBuildings,
        refreshFloors,
        refreshGroups,
        refreshDevices,
        backToOption,
        setDeviceLocationData
    }) => {
    const deviceBuildingId = useDeviceBuildingId();
    const building = buildings.filter(building => building.id === deviceBuildingId)[0];
    const deviceGroupId = useDeviceGroupId();
    const group = groups.filter(group => group.id === deviceGroupId)[0];
    const devicesInGroup = useState(devices.filter(device => device.groupId === deviceGroupId))[0];
    const groupFloor = useState(floors.filter(floor => floor.buildingId === deviceBuildingId && floor.floorNumber === group.floorNumber)[0])[0];
    const featureIndex = useState(group.featureIndex)[0];
    const [outerBounds, setOuterBounds] = useState(building.outerBounds);

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    }

    return (
        <DeviceLocationMap
            outerBounds={outerBounds}
            building={building}
            floorData={groupFloor}
            group={group}
            devicesInGroup={devicesInGroup}
            featureIndex={featureIndex}
            refreshBuildings={refreshBuildings}
            refreshFloors={refreshFloors}
            refreshGroups={refreshGroups}
            refreshDevices={refreshDevices}
            setNewOuterBounds={setNewOuterBounds}
            backToOption={backToOption}
            setDeviceLocationData={setDeviceLocationData}
        />
    )
}

export default DeviceLocationContainer;