import { FC, useCallback, useState } from 'react'
import { IBuilding } from './TableColumns/buildingsColumns';
import { IFloor } from './TableColumns/floorsColumns';
import SelectFloor from './SelectFloor';
import GroupLocationMap from './Geolocation/GroupLocationMap';
import { useGroupBuildingId } from '../../contexts/groupsOptions';
import { IFeatureCollection } from '../../tools/spacesDivider';

export const GROUP_LOCATION_OPTIONS = {
    MAP: "Map",
    SELECT_FLOOR: "Select floor",
}


interface GroupLocationContainerProps {
    buildings: IBuilding[];
    floors: IFloor[];
    floorSelected: IFloor | null;
    selectFloor: (floorSelected: IFloor) => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
    backToOption: () => void;
    setGroupLocationData: (floorNumber: number, featureIndex: number) => void;
}

const GroupLocationContainer: FC<GroupLocationContainerProps> = (
    {
        buildings,
        floors,
        floorSelected,
        selectFloor,
        refreshBuildings,
        refreshFloors,
        backToOption,
        setGroupLocationData
    }) => {
    const [groupLocationOptionToShow, setGroupLocationOptionToShow] = useState(GROUP_LOCATION_OPTIONS.MAP);
    const groupBuildingId = useGroupBuildingId();
    const building = buildings.filter(building => building.id === groupBuildingId)[0];
    const floorsInBuilding = useState(floors.filter(floor => floor.buildingId === building.id))[0];
    const [outerBounds, setOuterBounds] = useState(building.outerBounds);
    const [spaceSelected, setSpaceSelected] = useState<IFeatureCollection | null>(null);

    const giveSpaceSelected = useCallback((spaceSelected: IFeatureCollection) => {
        setSpaceSelected(spaceSelected);
    }, []);

    const backToMap = useCallback(() => {
        setGroupLocationOptionToShow(GROUP_LOCATION_OPTIONS.MAP);
    }, [])

    const selectFloorOption = useCallback(() => {
        setGroupLocationOptionToShow(GROUP_LOCATION_OPTIONS.SELECT_FLOOR);
    }, []);


    const giveFloorSelected = useCallback((floorSelected: IFloor) => {
        selectFloor(floorSelected);
    }, [selectFloor]);

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    }


    return (
        <>
            {groupLocationOptionToShow === GROUP_LOCATION_OPTIONS.MAP &&
                <GroupLocationMap
                    outerBounds={outerBounds}
                    building={building}
                    floors={floorsInBuilding}
                    floorSelected={floorSelected}
                    giveFloorSelected={giveFloorSelected}
                    spaceSelected={spaceSelected}
                    giveSpaceSelected={giveSpaceSelected}
                    refreshBuildings={refreshBuildings}
                    refreshFloors={refreshFloors}
                    setNewOuterBounds={setNewOuterBounds}
                    selectFloorOption={selectFloorOption}
                    backToOption={backToOption}
                    setGroupLocationData={setGroupLocationData}
                />
            }
            {groupLocationOptionToShow === GROUP_LOCATION_OPTIONS.SELECT_FLOOR &&
                <SelectFloor
                    buildingId={groupBuildingId}
                    backToMap={backToMap}
                    floorSelected={floorSelected}
                    giveFloorSelected={giveFloorSelected}
                />
            }
        </>
    )
}

export default GroupLocationContainer;