import { FC, SyntheticEvent, useState } from 'react';
import { useTable } from "../../../state";
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { SELECT_GROUP_MANAGED_COLUMNS, ISelectGroupManaged } from '../TableColumns/selectGroupManagedColumns';
import { IDigitalTwinState, ISensorState } from './GeolocationContainer';
import { findOutStatus } from './statusTools';
import { IAsset } from '../TableColumns/assetsColumns';
import { Column } from '../Utils/platformTable';
import { FormCard as FormContainer } from "../../Tools/FormTools";


const TableContainer = styled.div`
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    padding: 0px 5px;
    overflow: auto;
    /* width */
    &::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    &::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    &::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    &::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    div:first-child {
        margin-top: 0;
    }
`;

const ButtonsContainer = styled.div`
    flex-shrink: 0;
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
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
    min-width: 130px;

    @media (max-width: 600px) {
        flex: 1;
        min-width: 0;
    }

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

const addStateToGroupManaged = (
    groupsManaged: IGroupManaged,
    assets: IAsset[],
    digitalTwinsState: IDigitalTwinState[],
    sensorsState: ISensorState[]
) => {
    const assetsFiltered = assets.filter(asset => asset.groupId === groupsManaged.id);
    const assetsIdArray = assetsFiltered.map(asset => asset.id);
    const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwinState => assetsIdArray.indexOf(digitalTwinState.assetId) !== -1);
    const sensorsStateFiltered = sensorsState.filter(sensorState => assetsIdArray.indexOf(sensorState.assetId) !== -1);
    const state = findOutStatus(digitalTwinsStateFiltered, sensorsStateFiltered);
    return { ...groupsManaged, state };
}

interface SelectGroupManagedProps {
    orgId: number;
    floorNumber: number;
    backToMap: () => void;
    groupSelected: IGroupManaged | null;
    giveGroupManagedSelected: (groupManaged: IGroupManaged) => void;
    assets: IAsset[];
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[]
}

const SelectGroupManaged: FC<SelectGroupManagedProps> = (
    {
        orgId,
        floorNumber,
        backToMap,
        groupSelected,
        giveGroupManagedSelected,
        assets,
        digitalTwinsState,
        sensorsState
    }) => {
    const [selectedGroupManaged, setSelectedGroupManaged] = useState<ISelectGroupManaged | null>(null);
    const groupsManagedTable = useTable("groupsManaged");
    const groupsManagedFiltered = groupsManagedTable.filter(group => group.orgId === orgId && group.floorNumber === floorNumber);
    const selectGroupsManaged = useState(groupsManagedFiltered.map(group =>
        addStateToGroupManaged(group, assets, digitalTwinsState, sensorsState)
    ))[0];

    const onSubmit = () => {
        if (selectedGroupManaged) {  
            const groupsManagedTableFiltered = groupsManagedTable.filter(groupManaged => groupManaged.id === selectedGroupManaged.id);
            giveGroupManagedSelected(groupsManagedTableFiltered[0]);
        }
        backToMap();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setSelectedGroupManaged(null);
        backToMap();
    };


    return (
        <>
            <FormTitle>Select group</FormTitle>
            <FormContainer>
                <TableContainer>
                    <TableWithPaginationAndRowSelection
                        dataTable={selectGroupsManaged}
                        columnsTable={SELECT_GROUP_MANAGED_COLUMNS as Column<any>[]}
                        selectedItem={groupSelected}
                        setSelectedItem={(selectedGroupManaged: ISelectGroupManaged) => setSelectedGroupManaged(selectedGroupManaged)}
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

export default SelectGroupManaged;