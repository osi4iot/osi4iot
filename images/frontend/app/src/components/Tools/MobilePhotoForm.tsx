import { FC, SyntheticEvent } from 'react';
import Jimp from 'jimp/es';
import Paho from "paho-mqtt";
import styled from "styled-components";
import Camera from 'react-html5-camera-photo';
import 'react-html5-camera-photo/build/css/index.css';
import { IMobileTopic } from '../PlatformAssistant/TableColumns/topicsColumns';

const Title = styled.h2`
	font-size: 20px;
	margin-top: 30px;
	margin-bottom: 0px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 300px;
`;

interface ConnectionLedProps {
    readonly isMqttConnected: boolean;
}

const ConnectionLed = styled.span<ConnectionLedProps>`
	background-color: ${(props) => (props.isMqttConnected ? "#62f700" : "#f80000")};
	width: 17px;
	height: 17px;
	margin: -2px 10px;
	border-radius: 50%;
	border: 2px solid #ffffff;
	display: inline-block;
`;

const FormContainer = styled.div`
	font-size: 12px;
    height: calc(100vh - 160px);
	position: relative;
	margin: 0 5px;
	color: white;
	margin: 10px 0;
	padding: 10px;
	width: calc(100vw - 40px);
	max-width: 400px;
	border: 2px solid #3274d9;
	border-radius: 15px;

    video {
        width: calc(100vw - 70px);
        max-width: 360px;
        height: calc(100vh - 230px);
        object-fit: cover;
    }
    
    img {
        width: calc(100vw - 70px);
        max-width: 360px;
        height: calc(100vh - 230px);
        object-fit: cover;
    }
`;

const ButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    padding: 0 10px;
	align-items: center;
    background-color: #0c0d0f;
`;

const Button = styled.button`
	background-color: #3274d9;
	padding: 8px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 15px;

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


interface MobileSensorSelectFormProps {
    mqttClient: Paho.Client;
    isMqttConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}


const MobilePhotoForm: FC<MobileSensorSelectFormProps> = (
    {
        mqttClient,
        isMqttConnected,
        setMobileSensorSelected,
        mobileTopicSelected
    }) => {

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setMobileSensorSelected("none")
    };

    const handleTakePhoto = async (dataUri: string) => {
        if (isMqttConnected) {
            const image = await Jimp.read(dataUri);
            const bufferData = await image.getBufferAsync(Jimp.MIME_JPEG)
            const data2Send = bufferData.toString('base64');
            const groupHash = mobileTopicSelected.groupUid;
            const deviceHash = mobileTopicSelected.deviceUid;
            const topicHash = mobileTopicSelected.topicUid;
            const mqttTopic = `dev2dtm/Group_${groupHash}/Device_${deviceHash}/Topic_${topicHash}`;
            const message = new Paho.Message(JSON.stringify(data2Send));
            message.destinationName = mqttTopic;
            mqttClient?.send(message);
        }
    };

    return (
        <>
            <Title>
                Take photo <ConnectionLed isMqttConnected={isMqttConnected} />
            </Title>
            <FormContainer>
                <Camera
                    onTakePhoto={(dataUri) => { handleTakePhoto(dataUri); }}
                />
                <ButtonsContainer>
                    <Button onClick={onCancel}>
                        EXIT
                    </Button>
                </ButtonsContainer>
            </FormContainer>
        </>
    )
}

export default MobilePhotoForm;
