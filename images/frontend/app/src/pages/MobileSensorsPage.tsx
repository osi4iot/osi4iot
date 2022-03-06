import axios from "axios";
import React, { ChangeEvent, FC, SyntheticEvent, useEffect, useState } from "react";
import styled from "styled-components";
import Paho from "paho-mqtt";
import Alert from "../components/Tools/Alert";
import Header from "../components/Layout/Header";
import Main from "../components/Layout/Main";
import ServerError from "../components/Tools/ServerError";
import { useAuthState } from "../contexts/authContext";
import { ChildrenProp, IDevice } from "../interfaces/interfaces";
import { getDomainName, isValidNumber, isValidText, toFirstLetterUpperCase } from "../tools/tools";
import ReadAccelerations from "../tools/ReadingAccelerations";
import MqttConnection from "../tools/MqttConnection";
import ProgresBar from "../components/Tools/ProgressBar";
import { ITopic } from "../components/PlatformAssistant/TableColumns/topicsColumns";

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

const Form = styled.form`
	position: relative;
	margin: 0 5px;
	color: white;
	margin: 10px 0;
	padding: 10px 12px 90px 12px;
	width: 310px;
	border: 2px solid #3274d9;
	border-radius: 15px;
`;

const Label = styled.div`
	font-size: 14px;
	margin-bottom: 5px;
`;

interface InputProps {
	readonly isValidationRequired: boolean;
}

const Input = styled.input<InputProps>`
	background-color: #0b0c0e;
	padding: 8px 5px;
	font-size: 14px;
	margin-top: 2px;
	margin-bottom: 2px;
	color: white;
	width: 100%;
	border-width: 1px;
	border-style: solid;
	border-color: ${(props) => {
		let color = "#2c3235";
		if (props.isValidationRequired) {
			if (props.type === "text" && !isValidText(props.value as string)) color = "#e02f44";
			if (props.type === "number" && props.name === "totalReadingTime" && !isValidNumber(props.value as number, 10))
				color = "#e02f44";
			if (props.type === "number" && props.name === "samplingFrequency" && !isValidNumber(props.value as number, 2))
				color = "#e02f44";
		}
		return color;
	}};
	outline: none;

	&:focus {
		box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
	}
`;

const Select = styled.select<InputProps>`
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

const SubmitContainer = styled.div`
	position: absolute;
	bottom: 7px;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: 150px;
`;

const ProgressBarContainer = styled.div`
	position: absolute;
	bottom: 60px;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: 250px;
`;

const ItemContainer = styled.div`
	margin-top: 20px;
	width: 100%;
`;

interface SubmitProps {
	readonly isSensorReading: boolean;
}

const Submit = styled.input<SubmitProps>`
	width: 150px;
	background-color: ${(props) => (props.isSensorReading ? "#E02F44" : "#3274d9")};
	padding: 8px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: ${(props) => (props.isSensorReading ? "0 5px #59121B" : "0 5px #173b70")};
	margin-bottom: 15px;

	&:hover {
		background-color: ${(props) => (props.isSensorReading ? "#E02F44" : "#2461c0")};
		padding: 8px;
	}

	&:active {
		background-color: ${(props) => (props.isSensorReading ? "#E02F44" : "#2461c0")};
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const domainName = getDomainName();

interface ReadingParameters {
	deviceSelectedIndex: number;
	topicsSelect: ITopic[];
	totalReadingTime: number;
	samplingFrequency: number;
}

const areReadingParameterOK = (readingParameters: ReadingParameters): boolean => {
	let areOK = true;
	if (readingParameters.topicsSelect.length === 0) areOK = false;
	if (!isValidNumber(readingParameters.totalReadingTime, 10)) areOK = false;
	if (!isValidNumber(readingParameters.samplingFrequency, 2)) areOK = false;
	return areOK;
};

const initialFormValues = {
	deviceSelectedIndex: 0,
	mobileSensorSelectedIndex: 0,
	topicSelectedIndex: 0,
	totalReadingTime: 20,
	samplingFrequency: 25,
};

let mqttClient: (Paho.Client | null) = null;
const mobileSensors = ["accelerations"];

const MobileSensorsPage: FC<ChildrenProp> = ({ children }) => {
	const [devicesManaged, setDevicesManaged] = useState<IDevice[]>([]);
	const [topicsManaged, setTopicsManaged] = useState<ITopic[]>([]);
	const [topicsSelect, setTopicsSelect] = useState<ITopic[]>([]);
	const [topicOptionSelected, setTopicOptionSelected] = useState(0);
	const [isValidationRequired, setIsValidationRequired] = useState(false);
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [formValues, setFormValues] = useState(initialFormValues);
	const [readingProgress, setReadingProgress] = useState(0);
	const [isSensorReading, setIsSensorReadings] = useState(false);
	const { deviceSelectedIndex, mobileSensorSelectedIndex, topicSelectedIndex, totalReadingTime, samplingFrequency } = formValues;

	const { accessToken, loading, errorMessage } = useAuthState();

	useEffect(() => {
		const urlDevices = `https://${domainName}/admin_api/devices/user_managed`;
		const urlTopics = `https://${domainName}/admin_api/topics/user_managed`;
		const config = {
			headers: { Authorization: `Bearer ${accessToken}` },
		};
		axios
			.get(urlDevices, config)
			.then((response) => {
				const devices: IDevice[] = response.data;
				const devicesManaged = devices.filter(device => device.type === "Generic");
				const devicesManagedIdsArray = devicesManaged.map(device => device.id);
				setDevicesManaged(devicesManaged);
				axios
					.get(urlTopics, config)
					.then((response) => {
						const topics: ITopic[] = response.data;
						const topicsManaged = topics.filter(topic => devicesManagedIdsArray.indexOf(topic.deviceId) !== -1);
						setTopicsManaged(topicsManaged);
						const topicsForDeviceSelected = topicsManaged.filter(topic => topic.deviceId === devicesManaged[0].id);
						const topicsManagedForMobileSensor = topicsForDeviceSelected.filter(topic => (topic.payloadFormat as any)[mobileSensors[0]] !== undefined);
						setTopicsSelect(topicsManagedForMobileSensor);
					})
					.catch((error) => {
						console.log(error);
					});

			})
			.catch((error) => {
				console.log(error);
			});
	}, [accessToken]);

	useEffect(() => {
		mqttClient = MqttConnection(setIsMqttConnected);
	}, []);

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const changedFormValues = {
			...formValues,
			[e.target.name]: e.target.value,
		};
		setFormValues(changedFormValues);
	};

	const handleDeviceSelectChange = (e: React.FormEvent<HTMLSelectElement>) => {
		const deviceSelectedIndex = parseInt(e.currentTarget.value, 10);
		const selectedDevice = devicesManaged[deviceSelectedIndex];
		const topicsSelect = topicsManaged.filter(topic => topic.deviceId === selectedDevice.id);
		setTopicsSelect(topicsSelect);
		const changedFormValues = {
			...formValues,
			deviceSelectedIndex,
		};
		setFormValues(changedFormValues);
	};

	const handleMobileSensorSelectChange = (e: React.FormEvent<HTMLSelectElement>) => {
		const mobileSensorSelectedIndex = parseInt(e.currentTarget.value, 10);
		const selectedDevice = devicesManaged[deviceSelectedIndex];
		const selectedMobileSensor = mobileSensors[mobileSensorSelectedIndex];

		const topicsForDeviceSelected = topicsManaged.filter(topic => topic.deviceId === selectedDevice.id);
		const topicsManagedForMobileSensor = topicsForDeviceSelected.filter(topic => (topic.payloadFormat as any)[selectedMobileSensor] !== undefined);
		setTopicsSelect(topicsManagedForMobileSensor);

		const changedFormValues = {
			...formValues,
			mobileSensorSelectedIndex,
		};
		setFormValues(changedFormValues);
	};


	const handleTopicSelectChange = (e: React.FormEvent<HTMLSelectElement>) => {
		const topicOptionSelected = parseInt(e.currentTarget.value, 10);
		setTopicOptionSelected(topicOptionSelected);
		const selectedTopic = topicsSelect[topicOptionSelected];
		let topicSelectedIndex = 0;
		for (let index = 0; index < topicsManaged.length; index++) {
			if (topicsManaged[index].id === selectedTopic.id) {
				topicSelectedIndex = index;
				break;
			}
		}
		const changedFormValues = {
			...formValues,
			topicSelectedIndex,
		};
		setFormValues(changedFormValues);
	};

	const handleSubmit = async (e: SyntheticEvent) => {
		e.preventDefault();
		if (mqttClient && !isSensorReading) {
			const readingParameter = {
				deviceSelectedIndex,
				topicsSelect,
				totalReadingTime,
				samplingFrequency,
			};
			if (!areReadingParameterOK(readingParameter)) {
				setIsValidationRequired(true);
			} else {
				if (devicesManaged[deviceSelectedIndex] && topicsSelect.length !== 0 && topicsManaged[topicSelectedIndex]) {
					const groupHash = (devicesManaged[deviceSelectedIndex] as IDevice).groupUid;
					const deviceHash = (devicesManaged[deviceSelectedIndex] as IDevice).deviceUid;
					const topicHash = (topicsManaged[topicSelectedIndex] as ITopic).topicUid;
					const mqttTopic = `dev2pdb/Group_${groupHash}/Device_${deviceHash}/Topic_${topicHash}`;
					ReadAccelerations(mqttClient as Paho.Client, mqttTopic, readingParameter, setIsSensorReadings, setReadingProgress);
				}
			}
		}
	};

	return (
		<>
			<Header />
			<Main>
				<>
					<Title>
						Mobile sensors <ConnectionLed isMqttConnected={isMqttConnected} />
					</Title>
					{errorMessage && <ServerError errorText={errorMessage} />}
					<Form onSubmit={handleSubmit}>
						<ItemContainer>
							<Label>Platform device:</Label>
							<Select
								name="deviceSelected"
								isValidationRequired={isValidationRequired}
								onChange={handleDeviceSelectChange}
								value={deviceSelectedIndex}
								disabled={loading}
							>
								{devicesManaged.map((device_i, index) => {
									const device = device_i as IDevice;
									return (
										<option value={index} key={device.id}>
											{device.name}, GroupId= {device.groupId}
										</option>
									);
								})}
							</Select>
						</ItemContainer>
						<ItemContainer>
							<Label>Mobile sensor type:</Label>
							<Select
								name="mobileSensorSelected"
								isValidationRequired={isValidationRequired}
								onChange={handleMobileSensorSelectChange}
								value={mobileSensorSelectedIndex}
								disabled={loading}
							>
								{mobileSensors.map((mobileSensor, index) => {
									return (
										<option value={index} key={mobileSensor}>
											{toFirstLetterUpperCase(mobileSensor)}
										</option>
									);
								})}
							</Select>
						</ItemContainer>
						<ItemContainer>
							<Label>Topic name:</Label>
							<Select
								name="topicSelected"
								isValidationRequired={isValidationRequired}
								onChange={handleTopicSelectChange}
								value={topicOptionSelected}
								disabled={loading}
							>
								{topicsSelect.map((topic_i, index) => {
									const topic = topic_i as ITopic;
									return (
										<option value={index} key={topic.id}>
											{topic.topicName}
										</option>
									);
								})}
							</Select>
							{isValidationRequired && topicsSelect.length === 0 && (
								<Alert alertText="No topics for the sensor type selected." />
							)}
						</ItemContainer>

						<ItemContainer>
							<Label>Total reading time (sec):</Label>
							<Input
								type="number"
								name="totalReadingTime"
								isValidationRequired={isValidationRequired}
								onChange={handleInputChange}
								value={totalReadingTime}
								disabled={loading}
							/>
							{isValidationRequired && !isValidNumber(totalReadingTime, 10) && (
								<Alert alertText="Total reading time must be greater than 10 seconds" />
							)}
						</ItemContainer>

						<ItemContainer>
							<Label>Sampling frequency [samples/sec]:</Label>
							<Input
								type="number"
								name="samplingFrequency"
								isValidationRequired={isValidationRequired}
								onChange={handleInputChange}
								value={samplingFrequency}
								disabled={loading}
							/>
							{isValidationRequired && !isValidNumber(samplingFrequency, 2) && (
								<Alert alertText="The sampling frequency must be greater than 2 samples by second" />
							)}
						</ItemContainer>
						{isSensorReading ? (
							<ProgressBarContainer>
								<ProgresBar value={readingProgress} />
							</ProgressBarContainer>
						) : null}
						<SubmitContainer>
							{isSensorReading ? (
								<Submit type="submit" value="READING" disabled={loading} isSensorReading={isSensorReading} />
							) : (
								<Submit type="submit" value="READ" disabled={loading} isSensorReading={isSensorReading} />
							)}
						</SubmitContainer>
					</Form>
				</>
			</Main>
		</>
	);
};

export default MobileSensorsPage;
