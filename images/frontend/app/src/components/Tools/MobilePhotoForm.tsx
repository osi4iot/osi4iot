import { FC, SyntheticEvent } from "react";
import { NatsConnection, headers } from "nats.ws";
import styled from "styled-components";
import CameraComponent, { FACING_MODES } from 'react-html5-camera-photo';
import "react-html5-camera-photo/build/css/index.css";
import { IMobileTopic } from "../PlatformAssistant/TableColumns/topicsColumns";
import { FaShareSquare } from "react-icons/fa";

const Camera = CameraComponent as any;

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
    readonly isNatsConnected: boolean;
}

const ConnectionLed = styled.span<ConnectionLedProps>`
    background-color: ${(props) => (props.isNatsConnected ? "#62f700" : "#f80000")};
    width: 17px;
    height: 17px;
    margin: -2px 10px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    display: inline-block;
`;

const FormContainer = styled.div`
    font-size: 12px;
    height: calc(100vh - 190px);
    width: calc(100vw - 40px);
    position: relative;
    margin: 0 5px;
    color: white;
    margin: 10px 0;
    padding: 10px;
    max-width: 400px;
    border: 2px solid #3274d9;
    border-radius: 15px;

    video {
        height: calc(100vh - 230px);
        max-width: 360px;
        object-fit: cover;
    }

    img {
        height: calc(100vh - 230px);
        max-width: 360px;
        object-fit: cover;
    }
`;

const ExitIcon = styled(FaShareSquare as any)`
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

interface MobilePhotoFormProps {
    natsClient: NatsConnection;
    isNatsConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}

const MobilePhotoForm: FC<MobilePhotoFormProps> = ({
    natsClient,
    isNatsConnected,
    setMobileSensorSelected,
    mobileTopicSelected,
}) => {
    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setMobileSensorSelected("none");
    };

    const handleTakePhoto = async (dataUri: string) => {
        if (!isNatsConnected || !natsClient) return;

        const groupHash = mobileTopicSelected.groupUid;
        const topicHash = mobileTopicSelected.topicUid;
        const natsSubject = `dev2dtm.Group_${groupHash}.Topic_${topicHash}`;

        // Decode data URI to raw bytes via Fetch API (native, no JS loop)
        const res = await fetch(dataUri);
        const buffer = await res.arrayBuffer();
        const imageBytes = new Uint8Array(buffer);

        const h = headers();
        h.set("Content-Type", "image/jpeg");

        natsClient.publish(natsSubject, imageBytes, { headers: h });
    };

    return (
        <>
            <Title>
                Take photo <ConnectionLed isNatsConnected={isNatsConnected} />
            </Title>
            <FormContainer>
                <Camera
                    idealFacingMode={FACING_MODES.ENVIRONMENT}
                    onTakePhoto={(dataUri: string) => {
                        handleTakePhoto(dataUri);
                    }}
                />
                <ExitIcon onClick={onCancel} />
            </FormContainer>
        </>
    );
};

export default MobilePhotoForm;