import { FC, useState, SyntheticEvent, useEffect } from 'react';
import { type NatsConnection } from "@nats-io/nats-core";
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import FormikControl from "./FormikControl";
import ProgresBar from './ProgressBar';
import { IMobileTopic } from '../PlatformAssistant/TableColumns/topicsColumns';
import ReadMobileGeolocation, { MobileGeolocationReading } from '../../tools/ReadingMobileGeolocation';
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
    height: calc(100vh - 280px);
    width: 100%;
    padding: 10px 5px;
    margin-bottom: 15px;
    overflow-y: auto;
    &::-webkit-scrollbar { width: 10px; }
    &::-webkit-scrollbar-track { background: #202226; border-radius: 5px; }
    &::-webkit-scrollbar-thumb { background: #2c3235; border-radius: 5px; }
    &::-webkit-scrollbar-thumb:hover { background-color: #343840; }
    div:first-child { margin-top: 0; }
    div:last-child { margin-bottom: 3px; }
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

interface MobileGeolocationFormProps {
    natsClient: NatsConnection;
    isNatsConnected: boolean;
    setMobileSensorSelected: React.Dispatch<React.SetStateAction<string>>;
    mobileTopicSelected: IMobileTopic;
}

const initialMobileGeolocationFormValues = {
    totalReadingTime: 300,
    samplingPeriod: 5,
};

const Notice = styled.div`
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background-color: rgba(229, 62, 62, 0.15);
    border: 1px solid rgba(229, 62, 62, 0.5);
    color: #fbd5d5;
    font-size: 13px;
`;

const MobileGeolocationForm: FC<MobileGeolocationFormProps> = (
    {
        natsClient,
        isNatsConnected,
        setMobileSensorSelected,
        mobileTopicSelected,
    }) => {
    const [readingProgress, setReadingProgress] = useState(0);
    const [isSensorReading, setIsSensorReadings] = useState(false);
    const [reading, setReading] = useState<MobileGeolocationReading | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        return () => {
            if (reading) reading.stop();
        }
    }, [reading]);

    const validationSchema = Yup.object().shape({
        totalReadingTime: Yup.number().min(10, "The minimum reading time is 10 seconds").max(3600, "The maximum reading time is 3600 seconds").required('Required'),
        samplingPeriod: Yup.number().min(1, "The minimum sampling period is 1 second").max(60, "The maximum sampling period is 60 seconds").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setMobileSensorSelected("none");
        if (reading) reading.stop();
    };

    const handleSubmit = async (values: any, actions: any) => {
        if (natsClient && !isSensorReading && mobileTopicSelected != null) {
            setError("");
            const groupHash = mobileTopicSelected.groupUid;
            const topicHash = mobileTopicSelected.topicUid;
            const natsSubject = `dev2pdb_wt.Group_${groupHash}.Topic_${topicHash}`;
            const newReading = ReadMobileGeolocation(
                natsClient,
                natsSubject,
                Number(values.totalReadingTime),
                Number(values.samplingPeriod),
                { setIsSensorReadings, setReadingProgress, onError: setError },
            );
            setReading(newReading);
        }
    };

    return (
        <>
            <Title>
                Mobile geolocation <ConnectionLed isNatsConnected={isNatsConnected} />
            </Title>
            <FormContainer>
                <Formik initialValues={initialMobileGeolocationFormValues} validationSchema={validationSchema} onSubmit={handleSubmit} >
                    {
                        formik => (
                            // @ts-ignore
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
                                        label='Sampling period (sec)'
                                        name='samplingPeriod'
                                        type='text'
                                    />
                                    {error && <Notice role="alert">{error}</Notice>}
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

export default MobileGeolocationForm;
