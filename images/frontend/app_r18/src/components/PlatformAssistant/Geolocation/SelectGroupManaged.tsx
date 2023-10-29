import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { useGroupsManagedTable } from '../../../contexts/platformAssistantContext';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { SELECT_GROUP_MANAGED_COLUMNS, ISelectGroupManaged } from '../TableColumns/selectGroupManagedColumns';
import { IDigitalTwinState, ISensorState } from './GeolocationContainer';
import { findOutStatus } from './statusTools';
import { IAsset } from '../TableColumns/assetsColumns';


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
    const groupsManagedTable = useGroupsManagedTable();
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
                        columnsTable={SELECT_GROUP_MANAGED_COLUMNS}
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