import React, { FC, SyntheticEvent, useEffect, useState } from "react";
import styled from "styled-components";
import Paho from "paho-mqtt";
import { useAuthState, useAuthDispatch } from "../../contexts/authContext";
import axiosErrorHandler from "../../tools/axiosErrorHandler";
import { getAxiosInstance } from "../../tools/axiosIntance";
import { getDomainName, getProtocol, axiosAuth } from "../../tools/tools";
import { IDigitalTwinSimulator } from "../PlatformAssistant/TableColumns/digitalTwinsColumns";
import ServerError from "./ServerError";
import Slider from "./Slider";
import { useWindowWidth } from "@react-hook/window-size";


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
	position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
	margin: 0 5px;
	color: white;
	margin: 10px 0;
	padding: 10px 12px;
	width: 310px;
	border: 2px solid #3274d9;
	border-radius: 15px;
`;

const ParametersContainer = styled.div`
    height: calc(100vh - 290px);
    width: 100%;
    padding: 0px 5px;
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

const GetLastMeasurementsButtom = styled.button`
	width: 250px;
	background-color: #3274d9;
	padding: 8px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
	margin-bottom: 10px;

	&:hover {
		background-color: #2461c0;
		padding: 8px;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

interface ButtonsContainerProps {
    isMobile: boolean;
}

const ButtonsContainer = styled.div<ButtonsContainerProps>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 10px 10px;
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
    width: 250px;

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

const domainName = getDomainName();
const protocol = getProtocol();

interface IDTSParam {
    path: string;
    units?: string;
    label: string;
    minValue: number;
    maxValue: number;
    defaultValue?: number;
    step: number;
}

interface DigitalTwinSimulatorOptionsProps {
    isMqttConnected: boolean;
    mqttClient: Paho.Client | null,
    digitalTwinSimulatorSelected: IDigitalTwinSimulator,
    setShowDigitalTwinSimulator: React.Dispatch<React.SetStateAction<boolean>>;
}


const DigitalTwinSimulatorOptions: FC<DigitalTwinSimulatorOptionsProps> = ({
    isMqttConnected,
    mqttClient,
    digitalTwinSimulatorSelected,
    setShowDigitalTwinSimulator,
}) => {
    const [digitalTwinSimulatorParams, setDigitalTwinSimulatorParams] = useState<IDTSParam[]>([]);
    const [paramValues, setParamValues] = useState<Record<string, number>>({});
    const { accessToken, refreshToken, errorMessage } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [lastMqttMessageSended, setLastMqttMessageSended] = useState("");
    const [getLastMeasurementsButtomLabel, setGetLastMeasurementsButtomLabel] = useState("Get last measurement");
    const windowWidth = useWindowWidth();
    const isMobile = windowWidth < 768;

    const setParamValue = (path: string, value: number) => {
        setParamValues((prevValues: Record<string, number>) => {
            const newValues = { ...prevValues };
            newValues[path] = value;
            return newValues;
        })
    }

    const handleGetLastMeasurementsButton = () => {
        const digitalTwinSimulationFormat = digitalTwinSimulatorSelected.digitalTwinSimulationFormat;
        if (digitalTwinSimulatorSelected && Object.keys(digitalTwinSimulationFormat).length !== 0) {
            const topicsIdArray: number[] = [];
            Object.keys(digitalTwinSimulationFormat).forEach((field: string) => {
                if (digitalTwinSimulationFormat[field].topicId !== undefined) {
                    const topicId = digitalTwinSimulationFormat[field].topicId;
                    if (!topicsIdArray.includes(topicId)) topicsIdArray.push(topicId);
                }
            })

            if (topicsIdArray.length !== 0) {
                setGetLastMeasurementsButtomLabel("Loading...");
                const groupId = digitalTwinSimulatorSelected.groupId;
                const urlLastMeasurements = `${protocol}://${domainName}/admin_api/measurements_last_from_topicsid_array/${groupId}/`;
                const config = axiosAuth(accessToken);
                const topicsIdArrayObj = { topicsIdArray }
                getAxiosInstance(refreshToken, authDispatch)
                    .post(urlLastMeasurements, topicsIdArrayObj, config)
                    .then((response) => {
                        const lastMeasurements = response.data;
                        const newParamValues = { ...paramValues };
                        lastMeasurements.forEach((measurement: { payload: Record<string, number> }) => {
                            const payload = measurement.payload;
                            Object.keys(payload).forEach(fieldName => {
                                if (newParamValues[fieldName] !== undefined) {
                                    newParamValues[fieldName] = payload[fieldName];
                                }
                            });

                        });
                        setParamValues(newParamValues);
                        setGetLastMeasurementsButtomLabel("Get last measurement");
                    })
                    .catch((error) => {
                        axiosErrorHandler(error, authDispatch);
                        setGetLastMeasurementsButtomLabel("Get last measurement");
                    });
            }
        }
    }

    useEffect(() => {
        if (
            mqttClient &&
            isMqttConnected &&
            Object.keys(paramValues).length !== 0
        ) {
            const mqttTopic = digitalTwinSimulatorSelected.mqttTopic;
            const message = JSON.stringify(paramValues);
            if (lastMqttMessageSended !== message) {
                const mqttMessage = new Paho.Message(message);
                mqttMessage.destinationName = mqttTopic;
                mqttClient.send(mqttMessage);
                setLastMqttMessageSended(message);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mqttClient, paramValues]);


    useEffect(() => {
        const digitalTwinSimulatorFormat = digitalTwinSimulatorSelected.digitalTwinSimulationFormat as unknown as Record<string, IDTSParam>;
        const digitalTwinSimulatorParamNames = Object.keys(digitalTwinSimulatorFormat);
        const digitalTwinSimulatorParams: IDTSParam[] = [];
        const initialParamValues: Record<string, number> = {};
        digitalTwinSimulatorParamNames.forEach(paramPath => {
            const label = `${digitalTwinSimulatorFormat[paramPath].label} (${digitalTwinSimulatorFormat[paramPath].units}) `
            const digitalTwinSimulatorParam = {
                path: paramPath,
                label,
                minValue: digitalTwinSimulatorFormat[paramPath].minValue,
                maxValue: digitalTwinSimulatorFormat[paramPath].maxValue,
                step: digitalTwinSimulatorFormat[paramPath].step,
            }
            digitalTwinSimulatorParams.push(digitalTwinSimulatorParam);
            initialParamValues[paramPath] = digitalTwinSimulatorFormat[paramPath].defaultValue as number;
        });
        setDigitalTwinSimulatorParams(digitalTwinSimulatorParams);
        setParamValues(initialParamValues);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setShowDigitalTwinSimulator(false);
    }


    return (
        <>

            <Title>
                Digital twin simulator <ConnectionLed isMqttConnected={isMqttConnected} />
            </Title>
            {errorMessage && <ServerError errorText={errorMessage} />}
            <FormContainer>
                <ParametersContainer>
                    {
                        digitalTwinSimulatorParams.length &&
                        digitalTwinSimulatorParams.map((param) => {
                            return <Slider
                                key={param.path}
                                label={param.label}
                                min={param.minValue}
                                max={param.maxValue}
                                step={param.step}
                                value={paramValues[param.path]}
                                setValue={(value) => setParamValue(param.path, value)}
                            />;
                        })
                    }
                </ParametersContainer>
                <GetLastMeasurementsButtom onClick={handleGetLastMeasurementsButton}>
                    {getLastMeasurementsButtomLabel}
                </GetLastMeasurementsButtom>
                <ButtonsContainer isMobile={isMobile}>
                    <Button onClick={onCancel}>
                        Cancel
                    </Button>
                </ButtonsContainer>
            </FormContainer>
        </>

    );
};

export default DigitalTwinSimulatorOptions;