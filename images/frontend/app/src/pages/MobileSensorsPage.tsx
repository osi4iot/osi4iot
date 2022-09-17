import { FC, useState,useEffect } from 'react';
import Paho from "paho-mqtt";
import { ChildrenProp } from '../interfaces/interfaces';
import MqttConnection from '../tools/MqttConnection';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from '../tools/tools';
import Header from '../components/Layout/Header';
import Main from '../components/Layout/Main';
import MobileSensorSelectForm from '../components/Tools/MobileSensorSelectForm';
import MobileAccelerationForm from '../components/Tools/MobileAccelerationForm';
import MobilePhotoForm from '../components/Tools/MobilePhotoForm';
import { useAuthDispatch, useAuthState } from '../contexts/authContext';
import { IMobileTopic } from '../components/PlatformAssistant/TableColumns/topicsColumns';

export interface InitialMobileSensorData {
    orgAcronym: string;
    groupAcronym: string;
    deviceName: string;
    mobileSensor: string;
    topicName: string;
}

const domainName = getDomainName();
const protocol = getProtocol();

let mqttClient: (Paho.Client | null) = null;

const MobileSensorsPage: FC<ChildrenProp> = ({ children }) => {
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [initialMobileSensorData, setInitialMobileSensorData] = useState<InitialMobileSensorData | null>(null);
	const [mobileSensorSelected, setMobileSensorSelected] = useState("none");
	const [mobileTopicsManaged, setMobileTopicsManaged] = useState<IMobileTopic[]>([]);
	const [mobileTopicSelected, setMobileTopicSelected] = useState<IMobileTopic | null>(null);
	const { accessToken, refreshToken } = useAuthState();
	const authDispatch = useAuthDispatch();

	useEffect(() => {
		const urlTopics = `${protocol}://${domainName}/admin_api/topics_in_mobile/user_managed`;
		const config = axiosAuth(accessToken);
		axiosInstance(refreshToken, authDispatch)
			.get(urlTopics, config)
			.then((response) => {
				const mobileTopics: IMobileTopic[] = response.data;
				setMobileTopicsManaged(mobileTopics);
				setMobileTopicSelected(mobileTopics[0]);
				let mobileSensor = "none";
				if (mobileTopics[0].payloadFormat["mobile_accelerations"] !== undefined) {
					mobileSensor = "accelerations";
				} else if (mobileTopics[0].payloadFormat["mobile_photo"] !== undefined) {
					mobileSensor = "photo";
				}
				const initialMobileSensorData = {
					orgAcronym: mobileTopics[0].orgAcronym,
					groupAcronym: mobileTopics[0].groupAcronym,
					deviceName: mobileTopics[0].deviceName,
					mobileSensor: mobileSensor,
					topicName: mobileTopics[0].topicName
				}
				setInitialMobileSensorData(initialMobileSensorData);
			})
			.catch((error) => {
				console.log(error);
			});
	}, [accessToken, refreshToken, authDispatch]);

	useEffect(() => {
		mqttClient = MqttConnection(setIsMqttConnected);
	}, []);

	const handleMobileSensorSelection = (values: any, actions: any) => {
		const mobileSensorSelected = values.mobileSensor;
		setMobileSensorSelected(mobileSensorSelected);
	}

	return (
		<>
			<Header />
			<Main>
				<>
					{
						(mobileSensorSelected === "none" && initialMobileSensorData !== null) &&
						<MobileSensorSelectForm
							isMqttConnected={isMqttConnected}
							handleMobileSensorSelection={handleMobileSensorSelection}
							mobileTopicsManaged={mobileTopicsManaged}
							initialMobileSensorData={initialMobileSensorData as InitialMobileSensorData}
							setInitialMobileSensorData={setInitialMobileSensorData}
							setMobileTopicSelected={setMobileTopicSelected}
						/>
					}
					{
						mobileSensorSelected === "accelerations" &&
						<MobileAccelerationForm
							mqttClient={mqttClient as Paho.Client}
							isMqttConnected={isMqttConnected}
							setMobileSensorSelected={setMobileSensorSelected}
							mobileTopicSelected={mobileTopicSelected as IMobileTopic}
						/>
					}
					{
						mobileSensorSelected === "photo" &&
						<MobilePhotoForm
							mqttClient={mqttClient as Paho.Client}
							isMqttConnected={isMqttConnected}
							setMobileSensorSelected={setMobileSensorSelected}
							mobileTopicSelected={mobileTopicSelected as IMobileTopic}
						/>
					}					
				</>
			</Main>
		</>
	)
}

export default MobileSensorsPage;
