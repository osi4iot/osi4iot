import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { useFloorsTable } from '../../../contexts/platformAssistantContext';
import { IFloor } from '../TableColumns/floorsColumns';
import { ISelectFloorWithState, SELECT_FLOORS_WITH_STATE_COLUMNS } from '../TableColumns/selectFloorWithStateColumns';
import { IDigitalTwinState, ISensorState } from './GeolocationContainer';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { findOutStatus } from './statusTools';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 20px 10px 30px 10px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    /* width: 700px; */
    height: calc(100vh - 290px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const TableContainer = styled.div`
    height: calc(100vh - 420px);
    width: 100%;
    padding: 0px 5px;
    overflow: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    div:first-child {
        margin-top: 0;
    }
`;

const ButtonsContainer = styled.div`
    margin-top: 30px;
    display: flex;
    flex-direction: row;
    justify-content: space-around;
	align-items: center;
    background-color: #202226;
`;


const Button = styled.button`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 16px;
    width: 25%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}

    &:disabled {
        cursor: pointer;
        background-color: #3c3d40;
        box-shadow: 0 6px #19191a;
        color: white;

        &:hover,
        &:focus {
            cursor: not-allowed;
        }
    }
`;


interface SelectFloorWithStateProps {
    buildingId: number;
    backToMap: () => void;
    floorSelected: IFloor | null;
    giveFloorSelected: (floor: IFloor) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
    groupsData: IGroupManaged[];
    giveGroupManagedSelected: (groupManagedSelected: IGroupManaged) => void;
}

interface IFloorWithState extends IFloor {
    state: string;
}

const addStateToFloor = (
    floor: IFloor,
    groupsData: IGroupManaged[],
    digitalTwinsState: IDigitalTwinState[],
    sensorsState: ISensorState[]
): IFloorWithState => {
    const groupsFiltered = groupsData.filter(group => group.floorNumber === floor.floorNumber);
    const groupsIdArray = groupsFiltered.map(group => group.id);
    const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwinState => groupsIdArray.indexOf(digitalTwinState.groupId) !== -1);
    const sensorsStateFiltered = sensorsState.filter(sensorState => groupsIdArray.indexOf(sensorState.groupId) !== -1);
    const state = findOutStatus(digitalTwinsStateFiltered, sensorsStateFiltered);
    return { ...floor, state };
}

const SelectFloorWithState: FC<SelectFloorWithStateProps> = (
    {
        buildingId,
        backToMap,
        floorSelected,
        giveFloorSelected,
        digitalTwinsState,
        sensorsState,
        groupsData,
        giveGroupManagedSelected,
    }
) => {
    const [selectedFloor, setSelectedFloor] = useState<ISelectFloorWithState | null>(null);
    const floorsTable = useFloorsTable();
    const groupsFloorNumber = groupsData.map(group => group.floorNumber);
    const floorsOfGroups = floorsTable.filter(floor => (floor.buildingId === buildingId && groupsFloorNumber.indexOf(floor.floorNumber) !== -1));
    const selectFloors = useState(floorsOfGroups.map(floor => addStateToFloor(floor, groupsData, digitalTwinsState,sensorsState)))[0];

    const onSubmit = () => {
        if (selectedFloor) {
            const floorsTableFiltered = floorsTable.filter(floor => floor.id === selectedFloor.id);
            giveFloorSelected(floorsTableFiltered[0]);
            const groupsInFloorSelected = groupsData.filter(group => group.floorNumber === selectedFloor.floorNumber);
            if (groupsInFloorSelected.length === 1) {
                giveGroupManagedSelected(groupsInFloorSelected[0]);
            }
        }
        backToMap();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setSelectedFloor(null);
        backToMap();
    };


    return (
        <>
            <FormTitle>Select floor number</FormTitle>
            <FormContainer>
                <TableContainer>
                    <TableWithPaginationAndRowSelection
                        dataTable={selectFloors}
                        columnsTable={SELECT_FLOORS_WITH_STATE_COLUMNS}
                        selectedItem={floorSelected}
                        setSelectedItem={(selectedFloor: ISelectFloorWithState) => setSelectedFloor(selectedFloor)}
                        multipleSelection={false}
                        isGlobalFilterRequired={false}
                    />
                </TableContainer>
                <ButtonsContainer>
                    <Button type='button' onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type='button' onClick={onSubmit}>
                        Accept
                    </Button>
                </ButtonsContainer>
            </FormContainer>
        </>
    )
}

export default SelectFloorWithState;