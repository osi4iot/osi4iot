import { FC } from 'react';
import styled from "styled-components";
import {  useDevicesDispatch, useDeviceIdToEdit, useDeviceRowIndexToEdit, setDevicesOptionToShow } from '../../contexts/devices';
import { DEVICES_OPTIONS } from './platformAssistantOptions';
import { getDomainName } from '../../tools/tools';
import { IDevices } from './TableColumns/devicesColumns';


const Container = styled.div`
    width: 90%;
    height: 90%;
    padding: 1rem;
    background-color: #202226;
    margin: 20px;
    padding: 20px;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
`


const domainName = getDomainName();

interface EditDeviceProps {
    devices: IDevices[];
    refreshDevices: () => void;
}

const EditDevice: FC<EditDeviceProps> = ({devices, refreshDevices}) => {
    const devicesDispatch = useDevicesDispatch();
    const deviceId = useDeviceIdToEdit();
    const deviceRowIndex = useDeviceRowIndexToEdit();

    const handleSubmit = () => {
        const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.TABLE };
        setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
        refreshDevices();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Edit device</div>
            <div>Device id= {deviceId} </div>
            <div>Device row index= {deviceRowIndex} </div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default EditDevice;