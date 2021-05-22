import { FC } from 'react';
import styled from "styled-components";
import {  useDevicesDispatch, useDeviceIdToEdit, setDevicesOptionToShow } from '../../contexts/devices';
import { DEVICES_OPTIONS } from './platformAssistantOptions';
import { getDomainName } from '../../tools/tools';


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
    refreshDevices: () => void;
}

const EditDevice: FC<EditDeviceProps> = ({refreshDevices}) => {
    const devicesDispatch = useDevicesDispatch();
    const deviceId = useDeviceIdToEdit();

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
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default EditDevice;