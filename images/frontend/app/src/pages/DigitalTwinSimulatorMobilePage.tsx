import axios from "axios";
import React, { FC, useEffect, useState } from "react";
import styled from "styled-components";
import Paho from "paho-mqtt";
import Header from "../components/Layout/Header";
import Main from "../components/Layout/Main";
import ServerError from "../components/Tools/ServerError";
import { useAuthState } from "../contexts/authContext";
import { ChildrenProp } from "../interfaces/interfaces";
import { getDomainName } from "../tools/tools";
import MqttConnection from "../tools/MqttConnection";
import { IDigitalTwinSimulator } from "../components/PlatformAssistant/TableColumns/digitalTwinsColumns";
import Slider from "../components/Tools/Slider";

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
	margin: 0 5px;
	color: white;
	margin: 10px 0;
	padding: 10px 12px 90px 12px;
	width: 310px;
	border: 2px solid #3274d9;
	border-radius: 15px;
`;

const ParametersContainer = styled.div`
    height: calc(100vh - 270px);
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

const ItemContainer = styled.div`
	margin-top: 20px;
	width: 100%;
`;

const Label = styled.div`
	font-size: 14px;
	margin-bottom: 5px;
`;

const Select = styled.select`
	background-color: #0b0c0e;
	padding: 8px 5px;
	font-size: 12px;
	margin-top: 2px;
	margin-bottom: 2px;
	color: white;
	width: 100%;
	border-width: 1px;
	border-style: solid;
	border-color: #2c3235;
	outline: none;

	&:focus {
		box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
	}
`;


const domainName = getDomainName();

let mqttClient: (Paho.Client | null) = null;

interface IDTSParam {
	path: string;
	label: string;
	minValue: number;
	maxValue: number;
	defaultValue?: number;
	step: number;
}

const DigitalTwinSimulatorMobilePage: FC<ChildrenProp> = ({ children }) => {
	const [digitalTwinSimulatorsManaged, setDigitalTwinSimulatorsManaged] = useState<IDigitalTwinSimulator[]>([]);
	const [digitalTwinSimulatorParams, setDigitalTwinSimulatorParams] = useState<IDTSParam[]>([]);
	const [digitalTwinSelectedIndex, setDigitalTwinSelectedIndex] = useState(-1);
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [paramValues, setParamValues] = useState<Record<string, number>>({});
	const { accessToken, loading, errorMessage } = useAuthState();
	const [lastMqttMessageSended, setLastMqttMessageSended] = useState("");

	const setParamValue = (path: string, value: number) => {
		setParamValues((prevValues: Record<string, number>) => {
			const newValues = { ...prevValues };
			newValues[path] = value;
			return newValues;
		})
	}

	useEffect(() => {
		const urlDigitalTwinSimulators = `https://${domainName}/admin_api/digital_twin_simulators/user_managed`;
		const config = {
			headers: { Authorization: `Bearer ${accessToken}` },
		};
		axios
			.get(urlDigitalTwinSimulators, config)
			.then((response) => {
				const digitalTwinSimulatorsManaged: IDigitalTwinSimulator[] = response.data;
				setDigitalTwinSimulatorsManaged(digitalTwinSimulatorsManaged);
				if (digitalTwinSimulatorsManaged.length !== 0) setDigitalTwinSelectedIndex(0);
			})
			.catch((error) => {
				console.log(error);
			});
	}, [accessToken]);


	useEffect(() => {
		mqttClient = MqttConnection(setIsMqttConnected);
	}, []);

	useEffect(() => {
		if (
			mqttClient &&
			isMqttConnected &&
			digitalTwinSimulatorsManaged.length !== 0 &&
			digitalTwinSelectedIndex !== -1 &&
			Object.keys(paramValues).length !== 0
		) {
			const mqttTopic = digitalTwinSimulatorsManaged[digitalTwinSelectedIndex].mqttTopic;
			const message = JSON.stringify(paramValues);
			if (lastMqttMessageSended !== message) {
				const mqttMessage = new Paho.Message(message);
				mqttMessage.destinationName = mqttTopic;
				mqttClient.send(mqttMessage);
				setLastMqttMessageSended(message);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mqttClient, paramValues, digitalTwinSelectedIndex]);


	useEffect(() => {
		if (digitalTwinSimulatorsManaged.length !== 0 && digitalTwinSelectedIndex !== -1) {
			const digitalTwinSimulatorSelect = digitalTwinSimulatorsManaged[digitalTwinSelectedIndex];
			const digitalTwinSimulatorFormat = digitalTwinSimulatorSelect.digitalTwinSimulationFormat as unknown as Record<string, IDTSParam>;
			const digitalTwinSimulatorParamNames = Object.keys(digitalTwinSimulatorFormat);
			const digitalTwinSimulatorParams: IDTSParam[] = [];
			const initialParamValues: Record<string, number> = {};
			digitalTwinSimulatorParamNames.forEach(paramPath => {
				const digitalTwinSimulatorParam = {
					path: paramPath,
					label: digitalTwinSimulatorFormat[paramPath].label,
					minValue: digitalTwinSimulatorFormat[paramPath].minValue,
					maxValue: digitalTwinSimulatorFormat[paramPath].maxValue,
					step: digitalTwinSimulatorFormat[paramPath].step,
				}
				digitalTwinSimulatorParams.push(digitalTwinSimulatorParam);
				initialParamValues[paramPath] = digitalTwinSimulatorFormat[paramPath].defaultValue as number;
			});
			setDigitalTwinSimulatorParams(digitalTwinSimulatorParams);
			setParamValues(initialParamValues);
		}
	}, [digitalTwinSimulatorsManaged, digitalTwinSelectedIndex]);

	const handleDigitalTwinSelectChange = (e: React.FormEvent<HTMLSelectElement>) => {
		const digitalTwinSelectedIndex = parseInt(e.currentTarget.value, 10);
		setDigitalTwinSelectedIndex(digitalTwinSelectedIndex);
	};

	return (
		<>
			<Header />
			<Main>
				<>
					<Title>
						Digital twin simulator <ConnectionLed isMqttConnected={isMqttConnected} />
					</Title>
					{errorMessage && <ServerError errorText={errorMessage} />}
					<FormContainer>
						<ParametersContainer>
							<ItemContainer>
								<Label>Digital twin:</Label>
								<Select
									name="deviceSelected"
									onChange={handleDigitalTwinSelectChange}
									value={digitalTwinSelectedIndex}
									disabled={loading}
								>
									{digitalTwinSimulatorsManaged.map((dts, index) => {
										return (
											<option value={index} key={dts.id}>
												{dts.name}, GroupId= {dts.groupId}
											</option>
										);
									})}
								</Select>
							</ItemContainer>
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

					</FormContainer>
				</>
			</Main>
		</>
	);
};

export default DigitalTwinSimulatorMobilePage;
