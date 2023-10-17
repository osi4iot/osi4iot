import { FC, useState, SyntheticEvent, useEffect } from 'react';
import Paho from "paho-mqtt";
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import FormikControl from "./FormikControl";
import ProgresBar from './ProgressBar';
import { IMobileTopic } from '../PlatformAssistant/TableColumns/topicsColumns';
import ReadMobileOrientation from '../../tools/ReadingMobileOrientation';
import MobileSensorFormButtons from './MobileSensorFormButtons';

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
	padding: 10px 12px 90px 12px;
	width: calc(100vw - 40px);
	max-width: 400px;
	border: 2px solid #3274d9;
	border-radius: 15px;

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 230px);
    width: 100%;
    padding: 10px 5px;
    overflow-y: auto;
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

    div:last-child {
        margin-bottom: 3px;
    }
`;

const ProgressBarContainer = styled.div`
	position: absolute;
	bottom: 80px;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: calc(100vw - 65px);
	max-width: 375px;
`;


interface MobileOrientationSelectFormProps {
    mqttClient: Paho.Client;
    isMqttConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}

const initialMobileOrientationFormValues = {
    totalReadingTime: 60,
    samplingFrequency: 25,
};


const MobileOrientationForm: FC<MobileOrientationSelectFormProps> = (
    {
        mqttClient,
        isMqttConnected,
        setMobileSensorSelected,
        mobileTopicSelected,
    }) => {
    const [readingProgress, setReadingProgress] = useState(0);
    const [isSensorReading, setIsSensorReadings] = useState(false);
    const [quaternionSensor, setQuaternionSensor] = useState<AbsoluteOrientationSensor | null>(null);

    useEffect(() => {
        return () => {
            if (quaternionSensor) quaternionSensor.stop();
        }
    }, [quaternionSensor])

    const validationSchema = Yup.object().shape({
        totalReadingTime: Yup.number().min(20, "The minimum reading time is 20 seconds").max(300, "The maximum reading time is 300 seconds").required('Required'),
        samplingFrequency: Yup.number().min(25, "The minimum sampling frequency is 25Hz").max(50, "The maximum sampling frequency is 50Hz").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setMobileSensorSelected("none");
        if (quaternionSensor) quaternionSensor.stop();
    };

    const handleSubmit = async (values: any, actions: any) => {
        if (mqttClient && !isSensorReading && mobileTopicSelected != null) {
            const totalReadingTime = values.totalReadingTime;
            const samplingFrequency = values.samplingFrequency;
            const groupHash = mobileTopicSelected.groupUid;
            const topicHash = mobileTopicSelected.topicUid;
            const mqttTopic = `dev2pdb_wt/Group_${groupHash}/Topic_${topicHash}`;
            const quaternionSensor = ReadMobileOrientation(
                mqttClient as Paho.Client,
                mqttTopic,
                totalReadingTime,
                samplingFrequency,
                setIsSensorReadings,
                setReadingProgress,
            );
            setQuaternionSensor(quaternionSensor);
        }
    };

    return (
        <>
            <Title>
                Mobile orientation <ConnectionLed isMqttConnected={isMqttConnected} />
            </Title>
            <FormContainer>
                <Formik initialValues={initialMobileOrientationFormValues} validationSchema={validationSchema} onSubmit={handleSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='Total reading time (sec)'
                                        name='totalReadingTime'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Sampling frequency'
                                        name='samplingFrequency'
                                        type='text'
                                    />
                                </ControlsContainer>
                                {isSensorReading ? (
                                    <ProgressBarContainer>
                                        <ProgresBar value={readingProgress} />
                                    </ProgressBarContainer>
                                ) : null}
                                <MobileSensorFormButtons onCancel={onCancel} isValid={formik.isValid} isSensorReading={isSensorReading} />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default MobileOrientationForm;
