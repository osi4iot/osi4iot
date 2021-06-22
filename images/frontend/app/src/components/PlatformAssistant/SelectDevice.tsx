import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import FormTitle from "../Tools/FormTitle";
import TableWithPaginationAndRowSelection from './TableWithPaginationAndRowSelection';
import { useDevicesTable } from '../../contexts/platformAssistantContext';
import { IDevice } from './TableColumns/devicesColumns';
import { ISelectDevice, SELECT_DEVICE_COLUMNS } from './TableColumns/selectedDeviceColumns';

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


interface SelectDeviceProps {
    groupId: number;
    backToMap: () => void;
    giveDeviceSelected: (device: IDevice) => void;
}

const SelectDevice: FC<SelectDeviceProps> = ({ groupId, backToMap, giveDeviceSelected }) => {
    const [selectedDevice, setSelectedDevice] = useState<ISelectDevice | null>(null);
    const devicesTable = useDevicesTable();
    const selectDevice = useState(devicesTable.filter(device => device.groupId === groupId))[0];

    const onSubmit = () => {
        if (selectedDevice) {  
            const devicesTableFiltered = devicesTable.filter(device => device.id === selectedDevice.id);
            giveDeviceSelected(devicesTableFiltered[0]);
        }
        backToMap();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setSelectedDevice(null);
        backToMap();
    };


    return (
        <>
            <FormTitle>Select device</FormTitle>
            <FormContainer>
                <TableContainer>
                    <TableWithPaginationAndRowSelection
                        dataTable={selectDevice}
                        columnsTable={SELECT_DEVICE_COLUMNS}
                        setSelectedGroupManaged={(selectedDevice: ISelectDevice) => setSelectedDevice(selectedDevice)}
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

export default SelectDevice;