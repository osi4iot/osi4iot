import { FC, useState } from 'react'
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IDevice } from '../TableColumns/devicesColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { useGroupManagedBuildingId, useGroupManagedIdToEdit } from '../../../contexts/groupsManagedOptions';
import ElementLocationMap from '../Geolocation/ElementLocationMap';



interface NriLocationContainerProps {
    buildings: IBuilding[];
    floors: IFloor[];
    groupsManaged: IGroupManaged[];
    devices: IDevice[];
    refreshBuildings: () => void;
    refreshFloors: () => void;
    refreshGroups: () => void;
    refreshDevices: () => void;
    backToOption: () => void;
    setNodeRedIconLocationData: (nriLong: number, nriLat: number) => void;
}

const NriLocationContainer: FC<NriLocationContainerProps> = (
    {
        buildings,
        floors,
        groupsManaged,
        devices,
        refreshBuildings,
        refreshFloors,
        refreshGroups,
        refreshDevices,
        backToOption,
        setNodeRedIconLocationData
    }) => {
    const groupManagedBuildingId = useGroupManagedBuildingId();
    const building = buildings.filter(building => building.id === groupManagedBuildingId)[0];
    const groupManagedId = useGroupManagedIdToEdit();
    const groupManaged = groupsManaged.filter(group => group.id === groupManagedId)[0];
    const devicesInGroup = useState(devices.filter(device => device.groupId === groupManagedId))[0];
    const groupFloor = useState(floors.filter(floor =>
        floor.buildingId === groupManagedBuildingId &&
        floor.floorNumber === groupManaged.floorNumber)[0]
    )[0];
    const featureIndex = useState(groupManaged.featureIndex)[0];
    const [outerBounds, setOuterBounds] = useState(building.outerBounds);

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    }

    return (
        <ElementLocationMap
            elementToDrag={"nri"}
            outerBounds={outerBounds}
            building={building}
            floorData={groupFloor}
            groupManaged={groupManaged}
            devicesInGroup={devicesInGroup}
            featureIndex={featureIndex}
            refreshBuildings={refreshBuildings}
            refreshFloors={refreshFloors}
            refreshGroups={refreshGroups}
            refreshDevices={refreshDevices}
            setNewOuterBounds={setNewOuterBounds}
            backToOption={backToOption}
            setElementLocationData={setNodeRedIconLocationData}
        />
    )
}

export default NriLocationContainer;