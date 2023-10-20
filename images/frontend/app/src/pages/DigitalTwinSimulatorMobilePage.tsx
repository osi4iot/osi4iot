import { FC, useState,useEffect } from 'react';
import Paho from "paho-mqtt";
import { ChildrenProp } from '../interfaces/interfaces';
import MqttConnection from '../tools/MqttConnection';
import { axiosAuth, getDomainName, getProtocol } from '../tools/tools';
import Header from '../components/Layout/Header';
import Main from '../components/Layout/Main';
import { useAuthDispatch, useAuthState } from '../contexts/authContext';
import { useLoggedUserLogin } from '../contexts/authContext/authContext';
import { getAxiosInstance } from '../tools/axiosIntance';
import axiosErrorHandler from '../tools/axiosErrorHandler';
import { IDigitalTwinSimulator } from '../components/PlatformAssistant/TableColumns/digitalTwinsColumns';
import DigitalTwinSimulatorSelectForm from '../components/Tools/DigitalTwinSimulatorSelectForm';
import DigitalTwinSimulatorOptions from '../components/Tools/DigitalTwinSimulatorOptions';


export interface InitialDigitalTwinSimulatorData {
    orgAcronym: string;
    groupAcronym: string;
	assetName: string;
	assetDescription: string;
	digitalTwinName: string;
	digitalTwinDescription: string;
}

const domainName = getDomainName();
const protocol = getProtocol();

let mqttClient: (Paho.Client | null) = null;

const DigitalTwinSimulatorPage: FC<ChildrenProp> = ({ children }) => {
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [initialDigitalTwinSimulatorData, setInitialDigitalTwinSimulatorData] =
		useState<InitialDigitalTwinSimulatorData | null>(null);
	const [digitalTwinSimulatorsManaged, setDigitalTwinSimulatorsManaged] = useState<IDigitalTwinSimulator[]>([]);
	const { accessToken, refreshToken } = useAuthState();
	const [showDigitalTwinSimulator, setShowDigitalTwinSimulator] = useState(false);
	const authDispatch = useAuthDispatch();
	const userName = useLoggedUserLogin();
	const [digitalTwinSimulatorSelected, setDigitalTwinSimulatorSelected] = useState<IDigitalTwinSimulator | null>(null);

	useEffect(() => {
		const urlTopics = `${protocol}://${domainName}/admin_api/digital_twin_simulators/user_managed`;
		const config = axiosAuth(accessToken);
		getAxiosInstance(refreshToken, authDispatch)
			.get(urlTopics, config)
			.then((response) => {
				const digitalTwinSimulatorsManaged: IDigitalTwinSimulator[] = response.data;
				setDigitalTwinSimulatorsManaged(digitalTwinSimulatorsManaged);		
				const initialDigitalTwinSimulatorData = {
					orgAcronym: digitalTwinSimulatorsManaged[0].orgAcronym,
					groupAcronym: digitalTwinSimulatorsManaged[0].groupAcronym,
					assetName: `Asset_${digitalTwinSimulatorsManaged[0].assetUid}`,
					assetDescription: digitalTwinSimulatorsManaged[0].assetDescription,
					digitalTwinName: `DT_${digitalTwinSimulatorsManaged[0].digitalTwinUid}`,
					digitalTwinDescription: digitalTwinSimulatorsManaged[0].digitalTwinDescription
				}
				setInitialDigitalTwinSimulatorData(initialDigitalTwinSimulatorData);
			})
			.catch((error) => {
				axiosErrorHandler(error, authDispatch);
			});
	}, [accessToken, refreshToken, authDispatch]);

	useEffect(() => {
		mqttClient = MqttConnection(setIsMqttConnected, userName, accessToken);
	}, [userName, accessToken]);

	const handleNextButton = (digitalTwinSimulatorSelected: IDigitalTwinSimulator | null) => {
		if (digitalTwinSimulatorSelected) {
			setShowDigitalTwinSimulator(true);
		} else {
			setShowDigitalTwinSimulator(false);
		}
	}

	return (
		<>
			<Header />
			<Main>
				<>
					{
						(initialDigitalTwinSimulatorData !== null && !showDigitalTwinSimulator) &&
						<DigitalTwinSimulatorSelectForm
							isMqttConnected={isMqttConnected}
							handleNextButton={handleNextButton}
							digitalTwinSimulatorsManaged={digitalTwinSimulatorsManaged}
							initialDigitalTwinSimulatorData={initialDigitalTwinSimulatorData as InitialDigitalTwinSimulatorData}
							setInitialDigitalTwinSimulatorData={setInitialDigitalTwinSimulatorData}
							digitalTwinSimulatorSelected={digitalTwinSimulatorSelected}
							setDigitalTwinSimulatorSelected={setDigitalTwinSimulatorSelected}
						/>
					}
					{
						showDigitalTwinSimulator &&
						<DigitalTwinSimulatorOptions
						    isMqttConnected={isMqttConnected}
							mqttClient={mqttClient as Paho.Client}
							digitalTwinSimulatorSelected={digitalTwinSimulatorSelected as IDigitalTwinSimulator}
							setShowDigitalTwinSimulator={setShowDigitalTwinSimulator}
						/>
					}				
				</>
			</Main>
		</>
	)
}

export default DigitalTwinSimulatorPage;
