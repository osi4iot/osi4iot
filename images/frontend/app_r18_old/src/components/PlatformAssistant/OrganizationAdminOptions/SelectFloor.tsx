import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { useFloorsTable } from '../../../contexts/platformAssistantContext';
import { IFloor } from '../TableColumns/floorsColumns';
import { ISelectFloor, SELECT_FLOORS_COLUMNS } from '../TableColumns/selectFloorColumns';

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


interface SelectFloorProps {
    buildingId: number;
    backToMap: () => void;
    floorSelected: IFloor | null;
    giveFloorSelected: (floor: IFloor) => void;
}



const SelectFloor: FC<SelectFloorProps> = (
    {
        buildingId,
        backToMap,
        floorSelected,
        giveFloorSelected,
    }
) => {
    const [selectedFloor, setSelectedFloor] = useState<ISelectFloor | null>(null);
    const floorsTable = useFloorsTable();
    const selectFloors = useState(floorsTable.filter(floor => floor.buildingId === buildingId))[0];

    const onSubmit = () => {
        if (selectedFloor) {
            const floorsTableFiltered = floorsTable.filter(floor => floor.id === selectedFloor.id);
            giveFloorSelected(floorsTableFiltered[0]);
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
                        columnsTable={SELECT_FLOORS_COLUMNS}
                        selectedItem={floorSelected}
                        setSelectedItem={(selectedFloor: ISelectFloor) => setSelectedFloor(selectedFloor)}
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

export default SelectFloor;