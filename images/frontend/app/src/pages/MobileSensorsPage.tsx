import { FC, useState,useEffect } from 'react';
import Paho from "paho-mqtt";
import { ChildrenProp } from '../interfaces/interfaces';
import MqttConnection from '../tools/MqttConnection';
import { axiosAuth, getDomainName, getProtocol } from '../tools/tools';
import Header from '../components/Layout/Header';
import Main from '../components/Layout/Main';
import MobileSensorSelectForm from '../components/Tools/MobileSensorSelectForm';
import MobileAccelerationForm from '../components/Tools/MobileAccelerationForm';
import MobilePhotoForm from '../components/Tools/MobilePhotoForm';
import { useAuthDispatch, useAuthState } from '../contexts/authContext';
import { IMobileTopic } from '../components/PlatformAssistant/TableColumns/topicsColumns';
import { useLoggedUserLogin } from '../contexts/authContext/authContext';
import { getAxiosInstance } from '../tools/axiosIntance';
import axiosErrorHandler from '../tools/axiosErrorHandler';
import MobileOrientationForm from '../components/Tools/MobileOrientationForm';
import MobileMotionForm from '../components/Tools/MobileMotionForm';

export interface InitialMobileSensorData {
    orgAcronym: string;
    groupAcronym: string;
	assetName: string;
	assetDescription: string;
    mobileSensorDescription: string;
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
	const userName = useLoggedUserLogin();

	useEffect(() => {
		const urlTopics = `${protocol}://${domainName}/admin_api/topics_in_mobile/user_managed`;
		const config = axiosAuth(accessToken);
		getAxiosInstance(refreshToken, authDispatch)
			.get(urlTopics, config)
			.then((response) => {
				const mobileTopicsData: IMobileTopic[] = response.data;
				const mobileTopics = mobileTopicsData.filter(mobileTopic => mobileTopic.sensorType !== "geolocation");
				setMobileTopicsManaged(mobileTopics);
				setMobileTopicSelected(mobileTopics[0]);			
				const initialMobileSensorData = {
					orgAcronym: mobileTopics[0].orgAcronym,
					groupAcronym: mobileTopics[0].groupAcronym,
					assetName: `Asset_${mobileTopics[0].assetUid}`,
					assetDescription: mobileTopics[0].assetDescription,
					mobileSensor: mobileTopics[0].sensorType,
					mobileSensorDescription: mobileTopics[0].sensorDescription
				}
				setInitialMobileSensorData(initialMobileSensorData);
			})
			.catch((error) => {
				axiosErrorHandler(error, authDispatch);
			});
	}, [accessToken, refreshToken, authDispatch]);

	useEffect(() => {
		mqttClient = MqttConnection(setIsMqttConnected, userName, accessToken);
	}, [userName, accessToken]);

	const handleMobileSensorSelection = (values: any, actions: any) => {
		const mobileSensorSelected = values.mobileSensorDescription;
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
						mobileSensorSelected === "Mobile accelerations" &&
						<MobileAccelerationForm
							mqttClient={mqttClient as Paho.Client}
							isMqttConnected={isMqttConnected}
							setMobileSensorSelected={setMobileSensorSelected}
							mobileTopicSelected={mobileTopicSelected as IMobileTopic}
						/>
					}
					{
						mobileSensorSelected === "Mobile orientation" &&
						<MobileOrientationForm
							mqttClient={mqttClient as Paho.Client}
							isMqttConnected={isMqttConnected}
							setMobileSensorSelected={setMobileSensorSelected}
							mobileTopicSelected={mobileTopicSelected as IMobileTopic}
						/>
					}
					{
						mobileSensorSelected === "Mobile motion" &&
						<MobileMotionForm
							mqttClient={mqttClient as Paho.Client}
							isMqttConnected={isMqttConnected}
							setMobileSensorSelected={setMobileSensorSelected}
							mobileTopicSelected={mobileTopicSelected as IMobileTopic}
						/>
					}					
					{
						mobileSensorSelected === "Mobile photo" &&
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
