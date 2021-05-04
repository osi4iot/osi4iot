import axios from "axios";
import React, { ChangeEvent, FC, SyntheticEvent, useEffect, useState } from "react";
import styled from "styled-components";
import { nanoid } from "nanoid";
import Paho from "paho-mqtt";
import Alert from "../components/Alert";
import Header from "../components/Header";
import Main from "../components/Main";
import ServerError from "../components/ServerError";
import { useAuthState } from "../context";
import { ChildrenProp, IDevice } from "../interfaces/interfaces";
import { getDomainName, isValidNumber, isValidText } from "../tools/tools";
import ReadAccelerations from "../tools/ReadingAccelerations";
import MqttConnection from "../tools/MqttConnection";
import ProgresBar from "../components/ProgressBar";

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
	padding: 20px 20px 90px 20px;
	width: 300px;
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
			if (props.type === "number" && props.name === "samplingFrequency" && !isValidNumber(props.value as number, 20))
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
	border-color: ${(props) => {
		let color = "#2c3235";
		if (props.isValidationRequired) {
			if (!isValidText(props.value as string)) color = "#e02f44";
		}
		return color;
	}};
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
	totalReadingTime: number;
	samplingFrequency: number;
}

const areReadingParameterOK = (readingParameters: ReadingParameters): boolean => {
	let areOK = true;
	if (!isValidNumber(readingParameters.totalReadingTime, 10)) areOK = false;
	if (!isValidNumber(readingParameters.samplingFrequency, 20)) areOK = false;
	return areOK;
};

const initialFormValues = {
	deviceSelectedIndex: 0,
	topic: "accelerations",
	totalReadingTime: 20,
	samplingFrequency: 25,
};

let mqttClient: (Paho.Client | null ) = null;

const MobileSensorsPage: FC<ChildrenProp> = ({ children }) => {
	const [devicesManaged, setDevicesManaged] = useState([]);
	const [isValidationRequired, setIsValidationRequired] = useState(false);
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [formValues, setFormValues] = useState(initialFormValues);
	const [readingProgress, setReadingProgress] = useState(0);
	const [isSensorReading, setIsSensorReadings] = useState(false);
	const { deviceSelectedIndex, topic, totalReadingTime, samplingFrequency } = formValues;

	const { accessToken, loading, errorMessage } = useAuthState();

	useEffect(() => {
		const url = `https://${domainName}/admin_api/devices/user_managed`;
		const config = {
			headers: { Authorization: `Bearer ${accessToken}` },
		};
		axios
			.get(url, config)
			.then((response) => {
				const devices = response.data;
				setDevicesManaged(devices);
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

	const handleSelectChange = (e: React.FormEvent<HTMLSelectElement>) => {
		const changedFormValues = {
			...formValues,
			deviceSelectedIndex: parseInt(e.currentTarget.value, 10),
		};
		setFormValues(changedFormValues);
	};

	const handleSubmit = async (e: SyntheticEvent) => {
		e.preventDefault();
		if (mqttClient && !isSensorReading) {
			const readingParameter = {
				deviceSelectedIndex,
				totalReadingTime,
				samplingFrequency,
			};
			if (!areReadingParameterOK(readingParameter)) {
				setIsValidationRequired(true);
			} else {
				const GroupHash = (devicesManaged[deviceSelectedIndex] as IDevice).groupUid;
				const DeviceHash = (devicesManaged[deviceSelectedIndex] as IDevice).deviceUid;
				const mqttTopic = `dev2pdb/Group_${GroupHash}/Device_${DeviceHash}/${topic}`;
				ReadAccelerations(mqttClient as Paho.Client, mqttTopic, readingParameter, setIsSensorReadings, setReadingProgress);
			}
		}
	};

	return (
		<>
			<Header />
			<Main>
				<>
					<Title>
						Mobile accelerations <ConnectionLed isMqttConnected={isMqttConnected} />
					</Title>
					{errorMessage && <ServerError errorText={errorMessage} />}
					<Form onSubmit={handleSubmit}>
						<ItemContainer>
							<Label>Platform device:</Label>
							<Select
								name="deviceSelected"
								isValidationRequired={isValidationRequired}
								onChange={handleSelectChange}
								value={deviceSelectedIndex}
								disabled={loading}
							>
								{devicesManaged.map((device_i, index) => {
									const device = device_i as IDevice;
									return (
										<option value={index} key={nanoid()}>
											{device.name}, OrgId= {device.orgId}, GroupId= {device.groupId}
										</option>
									);
								})}
							</Select>
						</ItemContainer>

						<ItemContainer>
							<Label>Topic:</Label>
							<Input
								type="text"
								name="topic"
								isValidationRequired={isValidationRequired}
								onChange={handleInputChange}
								value={topic}
								disabled={loading}
							/>
							{isValidationRequired && !isValidText(topic) && <Alert alertText="Topic is required" />}
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
								<Alert alertText="Total reading time must be greater than 20 seconds" />
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
							{isValidationRequired && !isValidNumber(samplingFrequency, 20) && (
								<Alert alertText="The sampling frequency must be greater than 20 samples by second" />
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
