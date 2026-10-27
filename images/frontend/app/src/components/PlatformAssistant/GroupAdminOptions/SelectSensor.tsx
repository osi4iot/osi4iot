import { FC, SyntheticEvent, useState } from 'react';
import { useTable } from "../../../state";
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { ISelectSensor, SELECT_SENSOR_COLUMNS } from '../TableColumns/selectSensorColumns';
import { ISensor } from '../TableColumns/sensorsColumns';
import { FormCard as FormContainer } from "../../Tools/FormTools";

const TableContainer = styled.div`
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    padding: 0px 5px;
    overflow-y: auto;
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


interface SelectSensorProps {
    backToTable: () => void;
    giveSelectedSensor: (selectedSensor: ISelectSensor | null) => void;
}

interface ISensorWithName extends ISensor {
    name?: string;
}

const SelectSensor: FC<SelectSensorProps> = ({  backToTable,giveSelectedSensor }) => {
    const sensorsTable = useTable("sensors");
    sensorsTable.map((sensor: ISensorWithName ) => {
        sensor.name = `Sensor_${sensor.sensorUid}`;
        return sensor;
    })
    const [selectedSensor, setSelectedSensor] = useState<ISelectSensor | null>(null);

    const onSubmit = () => {
        giveSelectedSensor(selectedSensor as ISelectSensor);
        backToTable();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        giveSelectedSensor(null);
        backToTable();
    };


    return (
        <>
            <FormTitle>Select sensor</FormTitle>
            <FormContainer>
                <TableContainer>
                    <TableWithPaginationAndRowSelection
                        dataTable={sensorsTable}
                        columnsTable={SELECT_SENSOR_COLUMNS}
                        selectedItem={setSelectedSensor}
                        setSelectedItem={(selectedSensor: ISelectSensor) => setSelectedSensor(selectedSensor)}
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

export default SelectSensor;