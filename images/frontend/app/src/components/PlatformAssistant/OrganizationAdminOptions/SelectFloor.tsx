import { FC, SyntheticEvent, useState } from 'react';
import { useTable } from "../../../state";
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { IFloor } from '../TableColumns/floorsColumns';
import { ISelectFloor, SELECT_FLOORS_COLUMNS } from '../TableColumns/selectFloorColumns';
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
    const floorsTable = useTable("floors");
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