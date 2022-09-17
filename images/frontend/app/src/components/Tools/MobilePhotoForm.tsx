import { FC, SyntheticEvent } from 'react';
import Jimp from 'jimp/es';
import Paho from "paho-mqtt";
import styled from "styled-components";
import Camera, { FACING_MODES } from 'react-html5-camera-photo';
import 'react-html5-camera-photo/build/css/index.css';
import { IMobileTopic } from '../PlatformAssistant/TableColumns/topicsColumns';
import { FaShareSquare } from 'react-icons/fa';

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
        height: calc(100vh - 185px);
        object-fit: cover;
    }
    
    img {
        width: calc(100vw - 70px);
        max-width: 360px;
        height: calc(100vh - 185px);
        object-fit: cover;
    }
`;

const ExitIcon = styled(FaShareSquare)`
  background-color: #141619;
  font-size: 30px;
  color: #3274d9;
  position: absolute;
  top: 5px;
  right: 8px;

  &:hover {
    color: white;
    cursor: pointer;
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
                    idealFacingMode={FACING_MODES.ENVIRONMENT}
                    onTakePhoto={(dataUri) => { handleTakePhoto(dataUri); }}
                />
                {/* <ButtonsContainer>
                    <Button onClick={onCancel}>
                        EXIT
                    </Button>
                </ButtonsContainer> */}
                <ExitIcon onClick={onCancel} />
            </FormContainer>
        </>
    )
}

export default MobilePhotoForm;
