import { FC } from 'react';
import styled from "styled-components";
import { useDevicesDispatch, setDevicesOptionToShow } from '../../contexts/devices';
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

interface CreateDeviceProps {
    refreshDevices: () => void;
}

const CreateDevice: FC<CreateDeviceProps> = ({refreshDevices}) => {
    const devicesDispatch = useDevicesDispatch();

    const handleSubmit = () => {
        const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.TABLE };
        setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
        refreshDevices();
        console.log(domainName);
    }

    return (
        <Container>
            <div>Create device</div>
            <div>
                <button onClick={handleSubmit}>Submit</button>
            </div>
        </Container>
    )
}

export default CreateDevice;