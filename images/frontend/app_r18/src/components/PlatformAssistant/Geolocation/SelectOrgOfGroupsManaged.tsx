import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { useOrgsOfGroupsManagedTable } from '../../../contexts/platformAssistantContext';
import { ISelectOrgOfGroupsManaged, SELECT_ORG_OF_GROUPS_MANAGED_COLUMNS } from '../TableColumns/selectOrgOfGroupsManagedColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IDigitalTwinState, ISensorState } from './GeolocationContainer';
import { findOutStatus } from './statusTools';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';


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


interface SelectOrgOfGroupsManagedProps {
    backToMap: () => void;
    orgSelected: IOrgOfGroupsManaged | null;
    giveOrgOfGroupsManagedSelected: (orgManaged: IOrgOfGroupsManaged) => void;
    buildings: IBuilding[];
    giveBuildingSelected: (buildingSelected: IBuilding) => void;
    floors: IFloor[];
    giveFloorSelected: (floorSelected: IFloor) => void;
    groupsManaged: IGroupManaged[];
    giveGroupManagedSelected: (groupSelected: IGroupManaged) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
}

const SelectOrgOfGroupsManaged: FC<SelectOrgOfGroupsManagedProps> = (
    {
        backToMap,
        giveOrgOfGroupsManagedSelected,
        buildings,
        giveBuildingSelected,
        floors,
        giveFloorSelected,
        groupsManaged,
        orgSelected,
        giveGroupManagedSelected,
        digitalTwinsState,
        sensorsState
    }
) => {
    const [selectedOrgOfGroupsManaged, setSelectedOrgOfGroupsManaged] = useState<ISelectOrgOfGroupsManaged | null>(null);
    const orgsOfGroupsManagedTable = useOrgsOfGroupsManagedTable();
    const orgsOfGroupsManagedTableWithStatus = orgsOfGroupsManagedTable.map(org => {
        const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwin => digitalTwin.orgId === org.id);
        const sensorsStateFiltered = sensorsState.filter(sensorState => sensorState.orgId === org.id);
        const status = findOutStatus(digitalTwinsStateFiltered, sensorsStateFiltered);
        return { ...org, status };
    });
    const selectOrgsTable = useState(orgsOfGroupsManagedTableWithStatus)[0];


    const onSubmit = () => {
        if (selectedOrgOfGroupsManaged) {
            const orgsOfGroupsManagedTableFiltered = orgsOfGroupsManagedTable.filter(org => org.id === selectedOrgOfGroupsManaged.id);
            giveOrgOfGroupsManagedSelected(orgsOfGroupsManagedTableFiltered[0]);
            const buildingId = orgsOfGroupsManagedTableFiltered[0].buildingId;
            const buildingsFiltered = buildings.filter(building => building.id === buildingId);
            giveBuildingSelected(buildingsFiltered[0]);
            const groupsFiltered = groupsManaged.filter(group => group.orgId === selectedOrgOfGroupsManaged.id);
            const floorNumbersArray = Array.from(new Set(groupsFiltered.map(group => group.floorNumber)));
            if (floorNumbersArray.length === 1) {
                const floorsFiltered = floors.filter(floor => floor.buildingId === buildingId && floor.floorNumber === floorNumbersArray[0])
                giveFloorSelected(floorsFiltered[0]);
                if (groupsFiltered.length === 1) {
                    giveGroupManagedSelected(groupsFiltered[0]);
                }
            }
        }
        backToMap();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setSelectedOrgOfGroupsManaged(null);
        backToMap();
    };


    return (
        <>
            <FormTitle>Select organization</FormTitle>
            <FormContainer>
                <TableContainer>
                    <TableWithPaginationAndRowSelection
                        dataTable={selectOrgsTable}
                        columnsTable={SELECT_ORG_OF_GROUPS_MANAGED_COLUMNS}
                        selectedItem={orgSelected}
                        setSelectedItem={(selectedOrgOfGroupsManaged: ISelectOrgOfGroupsManaged) => setSelectedOrgOfGroupsManaged(selectedOrgOfGroupsManaged)}
                        multipleSelection={false}
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

export default SelectOrgOfGroupsManaged;