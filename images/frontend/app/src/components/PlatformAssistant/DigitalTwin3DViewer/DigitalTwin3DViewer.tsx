import { FC, useCallback, useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import { nanoid } from "nanoid";
import { FaShareSquare, FaFolderOpen, FaFolderMinus, FaChartLine } from "react-icons/fa";
import { RiWifiLine, RiWifiOffLine } from "react-icons/ri";
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei';
import DatGui, { DatNumber, DatFolder, DatBoolean, DatSelect, DatButton } from "react-dat-gui";
import "react-dat-gui/dist/dist/index.css";
import { Stage } from "./Stage";
import Model, {
	IAssetObject,
	IFemSimulationObject,
	IGenericObject,
	IResultRenderInfo,
	ISensorObject
} from './Model'
import {
	AssetState,
	FemSimulationObjectState,
	ObjectVisibilityState,
	IDigitalTwinGltfData,
	SensorState,
	GenericObjectState,
	FemSimObjectVisibilityState,
	readFemSimulationInfo,
	generateInitialFemSimObjectsState,
	generateInitialSensorsState,
	generateInitialAssetsState,
	generateInitialGenericObjectsState,
} from './ViewerUtils';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { axiosAuth, getDomainName, getProtocol, giveDefaultNumWebWorkers, openWindowTab } from '../../../tools/tools';
import SimulationLegend from './SimulationLegend';
import SetGltfObjects from './SetGlftOjbects';
import { useAuthDispatch, useAuthState } from '../../../contexts/authContext';
import { useLoggedUserLogin } from '../../../contexts/authContext/authContext';
import MqttConnector from './MqttHook/MqttConnector';
import formatDateString from '../../../tools/formatDate';
import { toast } from 'react-toastify';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import {
	setReloadDigitalTwinsTable,
	setWindowObjectReferences,
	usePlatformAssitantDispatch,
	useWindowObjectReferences
} from '../../../contexts/platformAssistantContext';
import { existFemResFileLocallyStored, readFemResFile, writeFemResFile } from '../../../tools/fileSystem';

const CanvasContainer = styled.div`
	background-color: #212121;
	height: 100%;
	color: white;
	width: 100%;
	position: relative;
`;

const SelectedObjectInfoContainer = styled.div`
    background-color: #141619;
    margin: 5px 10px;
    border-radius: 10px;
    padding: 5px;
    color: white;
    position: fixed;
    bottom: 12px;
    right: 0;
    width: 30%;
  `;

const ObjectInfoContainer = styled.div`
  font-size: 12px;
  padding: 3px 10px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
`;

const ObjectInfo = styled.div`
  margin: 0px 10px;
`;

const MaxMinValuesContainer = styled.div`
    background-color: #141619;
    margin: 5px 10px;
    border-radius: 10px;
    padding: 5px;
    color: white;
    position: fixed;
    bottom: 12px;
    left: 30;
    width: 18%;
  `;

const MaxMinFlexContainer = styled.div`
  font-size: 12px;
  padding: 3px 10px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
`;

const FemMaxValue = styled.div`
  margin: 0px 10px;
`;

const FemMinValue = styled.div`
  margin: 0px 10px;
`;

export interface SelectedObjectInfo {
	type: string;
	name: string;
	dashboardId: string;
	topicId: string;
}


const StyledDataGui = styled(DatGui)`
  &.react-dat-gui li.folder.closed .title {
    background-color: #141619;
  }

  &.react-dat-gui {
    max-height: calc(100vh - 320px);
	background-color: #212121;
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
  }
`

const StyledDatBoolean = styled(DatBoolean)`
    &.cr.boolean {
      border-left: 5px solid #806787;
      background-color: #141619;

      label {
        width: 100%;
  
        .label-text {
          width: 35% !important;
        }

        .checkbox-container {
          width: 65% !important;
        }
      }
    }
`;

const StyledDatNumber = styled(DatNumber)`
  &.cr.number {
    border-left: 5px solid #806787;
    background-color: #141619;

    label {
      width: 100%;

      .label-text {
        width: 34% !important;
      }
    }

    span {
      width: 66% !important;
    }
  }
`;

const StyledDatNumberDTSimulator = styled(DatNumber)`
  &.cr.number {
    border-left: 5px solid #806787;
    background-color: #141619;

    label {
      width: 100%;
	  flex-direction: column;
	  margin: 5px 0;

      .label-text {
        width: 100% !important;
		margin: 2px;
      }

	  span {
		width: 100% !important;

		.slider {
			border-left: 0;
		}
	  }
    }
  }
`;

const StyledDatSelect = styled(DatSelect)`
  &.cr.select {
    border-left: 5px solid #806787;
    background-color: #141619;

    label {
      width: 100%;

      .label-text {
        width: 20% !important;
      }
    }

    select {
      width: 80% !important;
      color: white;
      background-color: #141619;
      // border: 2px solid #b1b4b5;
      border: 2px solid #7d7f80;
      padding: 2px;
      margin-right: 5px;

      &:focus {
        outline: none;
        box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
      }

      &:hover {
        cursor: pointer;
        background-color: #0c0d0f;
      }

    }

    option {
      background-color: #35383d;
    }

  }
`;

const StyledDatButtom = styled(DatButton)`
  &.cr.button {
    border: 5px solid #141619;
	border-radius: 10px;
    background-color: #3274d9;

	&:hover {
		background: #2461c0;
	}

	.label-text {
        width: 90% !important;
		margin: auto;
		text-align: center;
    }

  }
`;

const HeaderContainer = styled.div`
  background-color: #141619;
  width: 280px;
  position: fixed;
  top: 203px;
  right: 15px;
  border-bottom: 3px solid #212121;
`;

const HeaderOptionsContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const MqttConnectionDiv = styled.div`
	background-color: #141619;
	padding: 20px 5px;
	font-size: 12px;
	color: #3274d9;
	height: 20px;
	display: flex;
	justify-content: center;
	align-items: center;
`;


const ExitIcon = styled(FaShareSquare)`
  	background-color: #141619;
	font-size: 30px;
	color: #3274d9;
  	margin: 10px;

  &:hover {
    color: white;
    cursor: pointer;
  }
`;

const DashboardIcon = styled(FaChartLine)`
  	background-color: #141619;
	font-size: 30px;
	color: #3274d9;
  	margin: 10px;

	&:hover {
		color: white;
		cursor: pointer;
	}
`;

const OpenFolderIcon = styled(FaFolderOpen)`
	background-color: #141619;
	font-size: 30px;
	color: #3274d9;
	margin: 10px;

	&:hover {
		color: white;
		cursor: pointer;
	}
`;

const CloseFolderIcon = styled(FaFolderMinus)`
	background-color: #141619;
	font-size: 30px;
	color: #3274d9;
	margin: 10px;

	&:hover {
		color: white;
		cursor: pointer;
	}
`;

const WifiIcon = styled(RiWifiLine)`
  background-color: #141619;
  font-size: 30px;
  color: #3274d9;
  margin: 10px 3px;
  transform: rotate(90deg);
`;

const NoWifiIcon = styled(RiWifiOffLine)`
  background-color: #141619;
  font-size: 30px;
  color: #3274d9;
  margin: 10px 5px;
  transform: rotate(90deg);
`;

const environmentOptions = [
	"none",
	"sunset",
	"dawn",
	"night",
	"warehouse",
	"forest",
	"apartment",
	"studio",
	"city",
	"park",
	"lobby"
]

const domainName = getDomainName();
const protocol = getProtocol();

const mouseButtons = {
	LEFT: THREE.MOUSE.PAN,
	MIDDLE: THREE.MOUSE.ROTATE,
	RIGHT: THREE.MOUSE.DOLLY,
}

const datGuiStyle = {
	marginTop: "256px",
	button: {
		borderLeft: "0px"
	}
};

interface Viewer3DProps {
	digitalTwinSelected: IDigitalTwin | null;
	digitalTwinGltfData: IDigitalTwinGltfData;
	close3DViewer: () => void;
	fetchFemResFileWorker: Worker;
}

const DigitalTwin3DViewer: FC<Viewer3DProps> = ({
	digitalTwinSelected,
	digitalTwinGltfData,
	close3DViewer,
	fetchFemResFileWorker
}) => {
	const [legendRenderer, setLegendRenderer] = useState<THREE.WebGLRenderer | null>(null);
	const { accessToken, refreshToken } = useAuthState();
	const plaformAssistantDispatch = usePlatformAssitantDispatch();
	const windowObjectReferences = useWindowObjectReferences();
	const userName = useLoggedUserLogin();
	const authDispatch = useAuthDispatch();
	const canvasContainerRef = useRef(null);
	const canvasRef = useRef(null);
	const controlsRef = useRef() as any;
	const selectedObjTypeRef = useRef(null);
	const selectedObjNameRef = useRef(null);
	const femMaxValueRef = useRef(null);
	const femMinValueRef = useRef(null);
	const selectedObjCollectionNameRef = useRef(null);
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
	const [sensorObjects, setSensorObjects] = useState<ISensorObject[]>([]);
	const [sensorCollectionNames, setSensorCollectionNames] = useState<string[]>([]);
	const [assetObjects, setAssetObjects] = useState<IAssetObject[]>([]);
	const [assetCollectionNames, setAssetCollectionNames] = useState<string[]>([]);
	const [genericObjects, setGenericObjects] = useState<IGenericObject[]>([]);
	const [genericObjectCollectionNames, setGenericObjectCollectionNames] = useState<string[]>([]);
	const [femSimulationObjects, setFemSimulationObjects] = useState<IFemSimulationObject[]>([]);
	const [femSimObjectCollectionNames, setFemSimObjectCollectionNames] = useState<string[]>([]);
	const [initialSensorsState, setInitialSensorsState] = useState<Record<string, SensorState> | null>(null);
	const [initialAssetsState, setInitialAssetsState] = useState<Record<string, AssetState> | null>(null);
	const [initialGenericObjectsState, setInitialGenericObjectsState] = useState<Record<string, GenericObjectState> | null>(null);
	const [initialFemSimObjectsState, setInitialFemSimObjectsState] = useState<FemSimulationObjectState[]>([]);
	const [
		initialGenericObjectsVisibilityState,
		setInitialGenericObjectsVisibilityState
	] = useState<Record<string, ObjectVisibilityState> | null>(null);
	const [femSimulationGeneralInfo, setFemSimulationGeneralInfo] = useState<Record<string, IResultRenderInfo> | null>(null);
	const [initialSensorsVisibilityState, setInitialSensorsVisibilityState] = useState<Record<string, ObjectVisibilityState> | null>(null);
	const [initialAssetsVisibilityState, setInitialAssetsVisibilityState] = useState<Record<string, ObjectVisibilityState> | null>(null);
	const [initialFemSimObjectsVisibilityState, setInitialFemSimObjectsVisibilityState] = useState<Record<string, FemSimObjectVisibilityState> | null>(null);
	const [digitalTwinSimulatorSendData, setDigitalTwinSimulatorSendData] = useState(false);
	const [lockReadingButtomLabel, setLockReadingButtomLabel] = useState("LOCK READ MEASUREMENTS");
	const [femMinValues, setFemMinValues] = useState<number[]>([]);
	const [femMaxValues, setFemMaxValues] = useState<number[]>([]);
	const [initialDigitalTwinSimulatorState, setInitialDigitalTwinSimulatorState] = useState<Record<string, number>>({});
	const [getLastMeasurementsButtomLabel, setGetLastMeasurementsButtomLabel] = useState("GET LAST MEASUREMENTS");
	const [femResultDates, setFemResultDates] = useState<string[]>([]);
	const [femResultFileNames, setFemResultFileNames] = useState<string[]>([]);
	const [femResultNames, setFemResultNames] = useState<string[]>([]);
	const [femResultData, setFemResultData] = useState<null | any>(null);
	const [femResultLoaded, setFemResultLoaded] = useState(false);
	const [femResFilesLastUpdate, setFemResFilesLastUpdate] = useState<Date>(new Date());

	const mqttOptions = {
		keepalive: 0,
		clientId: `Client_${nanoid(16).replace(/-/g, "x").replace(/_/g, "X")}`,
		port: 9001,
		username: `jwt_${userName}`,
		accessToken
	};

	const openDashboardTab = useCallback((url: string) => {
		openWindowTab(
			url,
			plaformAssistantDispatch,
			windowObjectReferences,
			setWindowObjectReferences
		);
	}, [plaformAssistantDispatch, windowObjectReferences]);


	const handleGetLastMeasurementsButton = () => {
		const digitalTwinSimulationFormat = digitalTwinGltfData.digitalTwinSimulationFormat;
		if (digitalTwinSelected && Object.keys(digitalTwinSimulationFormat).length !== 0) {
			const filteredTopics = digitalTwinGltfData.mqttTopicsData.filter(topic => topic.topicRef.slice(0, 7) === "dev2pdb");
			const topicsIdArray = filteredTopics.map(topic => topic.topicId);

			if (topicsIdArray.length !== 0) {
				setGetLastMeasurementsButtomLabel("LOADING...");
				const groupId = digitalTwinSelected.groupId
				const urlLastMeasurements = `${protocol}://${domainName}/admin_api/measurements_last_from_topicsid_array/${groupId}/`;
				const config = axiosAuth(accessToken);
				const topicsIdArrayObj = { topicsIdArray }
				getAxiosInstance(refreshToken, authDispatch)
					.post(urlLastMeasurements, topicsIdArrayObj, config)
					.then((response) => {
						const lastMeasurements = response.data;
						const newInitialDigitalTwinSimulatorState = { ...initialDigitalTwinSimulatorState };
						lastMeasurements.forEach((measurement: { payload: Record<string, number> }) => {
							const payload = measurement.payload;
							Object.keys(payload).forEach(fieldName => {
								if (newInitialDigitalTwinSimulatorState[fieldName] !== undefined) {
									newInitialDigitalTwinSimulatorState[fieldName] = payload[fieldName];
								}
							});

						});
						setInitialDigitalTwinSimulatorState(newInitialDigitalTwinSimulatorState);
						setGetLastMeasurementsButtomLabel("GET LAST MEASUREMENTS");
					})
					.catch((error) => {
						axiosErrorHandler(error, authDispatch);
						setGetLastMeasurementsButtomLabel("GET LAST MEASUREMENTS");
					});
			}
		}
	}

	const handleLockReadMeasurementsButtonClick = () => {
		if (lockReadingButtomLabel === "LOCK READ MEASUREMENTS") {
			setLockReadingButtomLabel("UNLOCK READ MEASUREMENTS");
		} else if (lockReadingButtomLabel === "UNLOCK READ MEASUREMENTS") {
			setLockReadingButtomLabel("LOCK READ MEASUREMENTS");
			setInitialSensorsState(generateInitialSensorsState(
				sensorObjects,
				digitalTwinGltfData,
			));
			setInitialAssetsState(generateInitialAssetsState(
				assetObjects,
				digitalTwinGltfData,
			));
			setInitialGenericObjectsState(generateInitialGenericObjectsState(
				genericObjects,
				digitalTwinGltfData,
			))
		}
		setDigitalTwinSimulatorSendData(prevState => !prevState);
		handleGetLastMeasurementsButton();
	}

	const handleControlPanelOpenAndClose = () => {
		if (isControlPanelOpen) setIsControlPanelOpen(false);
		else {
			handleGetLastMeasurementsButton();
			setIsControlPanelOpen(true);
		}
	}

	const handleOpenGrafanaDashboard = () => {
		if (digitalTwinSelected) {
			const dashboardUrl = digitalTwinSelected.dashboardUrl;
			if (dashboardUrl.slice(0, 7) === "Warning") {
				toast.warning(dashboardUrl);
			} else {
				// window.open(dashboardUrl, '_blank');
				openDashboardTab(dashboardUrl);
			}
		}
	}

	const [opts, setOpts] = useState({
		environment: "sunset",
		ambientLight: true,
		ambientLightIntensity: 1,
		spotLight: true,
		spotLightPower: 5,
		showSpotLightHelper: false,
		pointLight: true,
		pointLightPower: 5,
		showPointLightHelper: false,
		showAxes: false,
		showShadows: true,
		sensorsOpacity: 1,
		highlightAllSensors: false,
		showAllSensorsMarker: false,
		hideAllSensors: false,
		sensorsVisibilityState: undefined as unknown as Record<string, ObjectVisibilityState>,
		assetsOpacity: 1,
		highlightAllAssets: false,
		hideAllAssets: false,
		assetsVisibilityState: undefined as unknown as Record<string, ObjectVisibilityState>,
		animatedObjectsOpacity: 1,
		highlightAllAnimatedObjects: false,
		hideAllAnimatedObjects: false,
		animatedObjectsVisibilityState: undefined as unknown as Record<string, ObjectVisibilityState>,
		genericObjectsOpacity: 1,
		highlightAllGenericObjects: false,
		hideAllGenericObjects: false,
		genericObjectsVisibilityState: undefined as unknown as Record<string, ObjectVisibilityState>,
		femSimulationObjectsOpacity: 1,
		highlightAllFemSimulationObjects: false,
		hideAllFemSimulationObjects: false,
		femSimulationObjectsVisibilityState: undefined as unknown as Record<string, FemSimObjectVisibilityState>,
		hideFemSimulationLegend: false,
		femSimulationResult: "None result",
		femResultDate: femResultDates[0],
		showFemSimulationDeformation: false,
		femSimulationDefScale: 0,
		showAllFemSimulationMeshes: false,
		legendToShow: "None result",
		digitalTwinSimulatorState: undefined as unknown as Record<string, number>,
		numWebWorkers: giveDefaultNumWebWorkers(),
		logElapsedTime: false
	});

	useEffect(() => {
		const legendRenderer = new THREE.WebGLRenderer({ antialias: true });
		setLegendRenderer(legendRenderer);

		return () => {
			legendRenderer.dispose();
			legendRenderer.forceContextLoss();
		}
	}, [])


	useEffect(() => {
		if (initialGenericObjectsVisibilityState) {
			setOpts((prevOpts) => {
				const newOpts = { ...prevOpts };
				newOpts.genericObjectsVisibilityState = initialGenericObjectsVisibilityState;
				return newOpts;
			})
		}
	}, [initialGenericObjectsVisibilityState])

	useEffect(() => {
		if (initialSensorsVisibilityState) {
			setOpts((prevOpts) => {
				const newOpts = { ...prevOpts };
				newOpts.sensorsVisibilityState = initialSensorsVisibilityState;
				return newOpts;
			})
		}
	}, [initialSensorsVisibilityState])

	useEffect(() => {
		if (initialAssetsVisibilityState) {
			setOpts((prevOpts) => {
				const newOpts = { ...prevOpts };
				newOpts.assetsVisibilityState = initialAssetsVisibilityState;
				return newOpts;
			})
		}
	}, [initialAssetsVisibilityState])

	useEffect(() => {
		if (initialFemSimObjectsVisibilityState) {
			setOpts((prevOpts) => {
				const newOpts = { ...prevOpts };
				newOpts.femSimulationObjectsVisibilityState = initialFemSimObjectsVisibilityState;
				return newOpts;
			})
		}
	}, [initialFemSimObjectsVisibilityState])

	useEffect(() => {
		if (femSimulationObjects.length !== 0 && femResultData && Object.keys(femResultData).length !== 0) {
			const femResultNames = femResultData.metadata.resultFields.map(
				(resultField: { resultName: string; }) => resultField.resultName
			);
			setFemResultNames(femResultNames);
		}

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [femSimulationGeneralInfo, femSimulationObjects])

	useEffect(() => {
		if (Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat).length !== 0) {
			const digitalTwinSimulationFormat = digitalTwinGltfData.digitalTwinSimulationFormat;
			const digitalTwinSimulatorState: Record<string, number> = {};
			Object.keys(digitalTwinSimulationFormat).forEach(paramName => {
				if (initialDigitalTwinSimulatorState[paramName] !== undefined) {
					digitalTwinSimulatorState[paramName] = initialDigitalTwinSimulatorState[paramName];
				} else digitalTwinSimulatorState[paramName] = digitalTwinSimulationFormat[paramName].defaultValue;
			})
			setOpts((prevOpts) => {
				const newOpts = { ...prevOpts };
				newOpts.digitalTwinSimulatorState = digitalTwinSimulatorState;
				return newOpts;
			})
		}
	}, [initialDigitalTwinSimulatorState, digitalTwinGltfData.digitalTwinSimulationFormat])

	useEffect(() => {
		if (digitalTwinSelected) {
			const config = axiosAuth(accessToken);
			const groupId = digitalTwinSelected.groupId;
			const digitalTwinId = digitalTwinSelected.id;
			let urlBase = `${protocol}://${domainName}/admin_api/digital_twin_file_list`;
			const urlFemResFolderBase = `${urlBase}/${groupId}/${digitalTwinId}`;
			const urlFemResFolder = `${urlFemResFolderBase}/femResFiles`;
			getAxiosInstance(refreshToken, authDispatch)
				.get(urlFemResFolder, config)
				.then((response) => {
					const femResFilesInfo: { fileName: string; lastModified: string }[] = response.data;
					const femResultDates = femResFilesInfo.map(fileInfo => formatDateString(fileInfo.lastModified))
					setFemResultDates(femResultDates);
					const femResultFileNames = femResFilesInfo.map(fileInfo => fileInfo.fileName.split("/")[4]);
					setFemResultFileNames(femResultFileNames)
				})
				.catch((error) => {
					const warningMessage = "This model not have FEM results file.";
					toast.warning(warningMessage);
				});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [femResFilesLastUpdate]);


	useEffect(() => {
		if (digitalTwinSelected && femResultDates.length !== 0 && femResultFileNames.length !== 0) {
			let femResultDate = opts.femResultDate;
			if (femResultDate === undefined || femResultDate === "-") {
				femResultDate = femResultDates[0];
			}
			if (femResultDate !== undefined) {
				const fileDateIndex = femResultDates.indexOf(femResultDate);
				const femResultFileName = femResultFileNames[fileDateIndex];
				const groupId = digitalTwinSelected.groupId;
				const digitalTwinId = digitalTwinSelected.id;
				let urlBase = `${protocol}://${domainName}/admin_api/digital_twin_download_file`;
				const urlFemResFileBase = `${urlBase}/${groupId}/${digitalTwinId}`;
				const urlFemResFile = `${urlFemResFileBase}/femResFiles/${femResultFileName}`;
				const config = axiosAuth(accessToken);
				const digitalTwinUid = digitalTwinSelected.digitalTwinUid;

				existFemResFileLocallyStored(
					digitalTwinUid,
					femResultFileName,
					femResultDates,
					femResultFileNames
				).then(async (exists: boolean) => {
					if (exists) {
						const femResData = await readFemResFile(digitalTwinUid, femResultFileName);
						setFemResultData(femResData);
						readFemSimulationInfo(
							legendRenderer as THREE.WebGLRenderer,
							femResData,
							setFemSimulationGeneralInfo
						)
					} else {
						if (window.Worker) {
							const message = {
								urlFemResFile,
								accessToken,
								digitalTwinUid: digitalTwinSelected.digitalTwinUid
							};
							fetchFemResFileWorker.postMessage(message);
							fetchFemResFileWorker.onmessage = (e: MessageEvent<string>) => {
								const femResData = (e.data as any);
								setFemResultData(femResData);
								readFemSimulationInfo(
									legendRenderer as THREE.WebGLRenderer,
									femResData,
									setFemSimulationGeneralInfo
								)
								writeFemResFile(digitalTwinUid, femResultFileName, femResData, femResultDate);
								const reloadDigitalTwinsTable = true;
								setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable })
							};
							fetchFemResFileWorker.onerror = (event: ErrorEvent) => {
								const errorMessage = "FEM results file can not be downloaded";
								toast.warning(errorMessage);
							}
						} else {
							getAxiosInstance(refreshToken, authDispatch)
								.get(urlFemResFile, config)
								.then((response) => {
									const femResData = response.data;
									setFemResultData(femResData);
									readFemSimulationInfo(
										legendRenderer as THREE.WebGLRenderer,
										femResData,
										setFemSimulationGeneralInfo
									);
									writeFemResFile(digitalTwinUid, femResultFileName, femResData, femResultDate);
								})
								.catch((error) => {
									const errorMessage = "FEM results file can not be downloaded";
									toast.warning(errorMessage);
								});
						}
					}
				})

			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		femResultDates,
		femResultFileNames,
		opts.femResultDate,
		fetchFemResFileWorker
	]);

	useEffect(() => {
		if (digitalTwinSelected && femResultData && femSimulationObjects.length !== 0) {
			setInitialFemSimObjectsState(
				generateInitialFemSimObjectsState(
					femSimulationObjects,
					digitalTwinGltfData,
					femResultData
				)
			)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		femResultData,
		femSimulationObjects
	]);


	useEffect(() => {
		if (
			femResultData &&
			opts.femSimulationResult !== "None result" &&
			femMinValues.length !== 0 &&
			femMinValueRef &&
			femMinValueRef.current
		) {
			const femMinValuesFiltered: number[] = [];
			if (!opts.hideAllFemSimulationObjects) {
				femSimulationObjects.forEach((obj, index) => {
					const collectionName = obj.collectionName;
					if (!opts.femSimulationObjectsVisibilityState[collectionName].hide) femMinValuesFiltered.push(femMinValues[index]);
				});
			}

			if (femMinValuesFiltered.length !== 0) {
				const sortedFemMinValues = femMinValuesFiltered.slice().sort((a, b) => a - b);
				const resultFields = femResultData.metadata.resultFields;
				const resultFieldFiltered = resultFields.filter((result: { resultName: string; }) => result.resultName === opts.femSimulationResult)[0];
				const units = resultFieldFiltered.units;
				(femMinValueRef.current as any).innerHTML = `Min value: ${sortedFemMinValues[0].toExponential(4)} ${units}`;
			} else {
				(femMinValueRef.current as any).innerHTML = "Min value: -";
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		opts.femResultDate,
		opts.femSimulationResult,
		opts.hideAllFemSimulationObjects,
		opts.femSimulationObjectsVisibilityState,
		femMinValueRef,
		femMinValues
	]);

	useEffect(() => {
		if (
			femResultData &&
			opts.femSimulationResult !== "None result" &&
			femMaxValues.length !== 0 &&
			femMaxValueRef &&
			femMaxValueRef.current
		) {
			const femMaxValuesFiltered: number[] = [];
			if (!opts.hideAllFemSimulationObjects) {
				femSimulationObjects.forEach((obj, index) => {
					const collectionName = obj.collectionName;
					if (!opts.femSimulationObjectsVisibilityState[collectionName].hide) femMaxValuesFiltered.push(femMaxValues[index]);
				});
			}

			if (femMaxValuesFiltered.length !== 0) {
				const sortedFemMaxValues = femMaxValuesFiltered.slice().sort((a, b) => b - a);
				const resultFields = femResultData.metadata.resultFields;
				const resultFieldFiltered = resultFields.filter((result: { resultName: string; }) => result.resultName === opts.femSimulationResult)[0];
				const units = resultFieldFiltered.units;
				(femMaxValueRef.current as any).innerHTML = `Max value: ${sortedFemMaxValues[0].toExponential(4)} ${units}`;
			} else {
				(femMaxValueRef.current as any).innerHTML = "Max value: -";
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		opts.femResultDate,
		opts.femSimulationResult,
		opts.hideAllFemSimulationObjects,
		opts.femSimulationObjectsVisibilityState,
		femMaxValueRef,
		femMaxValues
	]);

	return (
		<>
			{
				(
					digitalTwinSelected &&
					digitalTwinGltfData &&
					digitalTwinGltfData.digitalTwinGltfUrl
				) &&
				<SetGltfObjects
					digitalTwinGltfData={digitalTwinGltfData}
					setSensorObjects={setSensorObjects}
					setSensorCollectionNames={setSensorCollectionNames}
					setAssetObjects={setAssetObjects}
					setAssetCollectionNames={setAssetCollectionNames}
					setGenericObjects={setGenericObjects}
					setGenericObjectCollectionNames={setGenericObjectCollectionNames}
					setFemSimulationObjects={setFemSimulationObjects}
					setFemSimObjectCollectionNames={setFemSimObjectCollectionNames}
					setInitialSensorsState={setInitialSensorsState}
					setInitialAssetsState={setInitialAssetsState}
					setInitialGenericObjectsState={setInitialGenericObjectsState}
					setInitialGenericObjectsVisibilityState={setInitialGenericObjectsVisibilityState}
					setInitialSensorsVisibilityState={setInitialSensorsVisibilityState}
					setInitialAssetsVisibilityState={setInitialAssetsVisibilityState}
					setInitialFemSimObjectsVisibilityState={setInitialFemSimObjectsVisibilityState}
					setInitialDigitalTwinSimulatorState={setInitialDigitalTwinSimulatorState}
				/>
			}
			<CanvasContainer ref={canvasContainerRef}>
				<Canvas ref={canvasRef}
					dpr={window.devicePixelRatio}
					orthographic
					shadows
					onCreated={canvasCtx => { canvasCtx.gl.physicallyCorrectLights = true; }}
					camera={{ position: [4, 4, 0], zoom: 300 }}
				>
					<Stage
						controls={controlsRef}
						environment={opts.environment}
						ambientLight={opts.ambientLight}
						ambientLightIntensity={opts.ambientLightIntensity}
						spotLight={opts.spotLight}
						spotLightPower={opts.spotLightPower}
						showSpotLightHelper={opts.showSpotLightHelper}
						pointLight={opts.pointLight}
						pointLightPower={opts.pointLightPower}
						showPointLightHelper={opts.showPointLightHelper}
						shadows={opts.showShadows}
						showAxes={opts.showAxes}
						femResultLoaded={femResultLoaded}
					>
						<MqttConnector hostname={domainName} options={mqttOptions} >
							<Model
								digitalTwinGltfData={digitalTwinGltfData}
								femResultData={femResultData}
								sensorObjects={sensorObjects}
								initialSensorsState={initialSensorsState as Record<string, SensorState>}
								sensorsVisibilityState={opts.sensorsVisibilityState}
								assetObjects={assetObjects}
								initialAssetsState={initialAssetsState as Record<string, SensorState>}
								assetsVisibilityState={opts.assetsVisibilityState}
								animatedObjectsVisibilityState={opts.animatedObjectsVisibilityState}
								femSimulationObjects={femSimulationObjects}
								femSimulationGeneralInfo={femSimulationGeneralInfo as Record<string, IResultRenderInfo>}
								initialFemSimObjectsState={initialFemSimObjectsState}
								femSimulationObjectsVisibilityState={opts.femSimulationObjectsVisibilityState}
								genericObjects={genericObjects}
								initialGenericObjectsState={initialGenericObjectsState as Record<string, GenericObjectState>}
								genericObjectsVisibilityState={opts.genericObjectsVisibilityState}
								mqttTopicsData={digitalTwinGltfData.mqttTopicsData}
								topicIdBySensorRef={digitalTwinGltfData.topicIdBySensorRef}
								dashboardUrl={digitalTwinSelected?.dashboardUrl as string}
								sensorsOpacity={opts.sensorsOpacity}
								highlightAllSensors={opts.highlightAllSensors}
								showAllSensorsMarker={opts.showAllSensorsMarker}
								hideAllSensors={opts.hideAllSensors}
								assetsOpacity={opts.assetsOpacity}
								highlightAllAssets={opts.highlightAllAssets}
								hideAllAssets={opts.hideAllAssets}
								animatedObjectsOpacity={opts.animatedObjectsOpacity}
								highlightAllAnimatedObjects={opts.highlightAllAnimatedObjects}
								hideAllAnimatedObjects={opts.hideAllAnimatedObjects}
								femSimulationObjectsOpacity={opts.femSimulationObjectsOpacity}
								hideAllFemSimulationObjects={opts.hideAllFemSimulationObjects}
								showFemSimulationDeformation={opts.showFemSimulationDeformation}
								highlightAllFemSimulationObjects={opts.highlightAllFemSimulationObjects}
								showAllFemSimulationMeshes={opts.showAllFemSimulationMeshes}
								genericObjectsOpacity={opts.genericObjectsOpacity}
								highlightAllGenericObjects={opts.highlightAllGenericObjects}
								hideAllGenericObjects={opts.hideAllGenericObjects}
								setIsMqttConnected={isMqttConnected => setIsMqttConnected(isMqttConnected)}
								canvasRef={canvasRef}
								selectedObjTypeRef={selectedObjTypeRef}
								selectedObjNameRef={selectedObjNameRef}
								selectedObjCollectionNameRef={selectedObjCollectionNameRef}
								femSimulationResult={opts.femSimulationResult}
								femSimulationDefScale={opts.femSimulationDefScale}
								digitalTwinSimulatorState={opts.digitalTwinSimulatorState}
								digitalTwinSimulatorSendData={digitalTwinSimulatorSendData}
								setFemMinValues={setFemMinValues}
								setFemMaxValues={setFemMaxValues}
								setFemResFilesLastUpdate={setFemResFilesLastUpdate}
								initialDigitalTwinSimulatorState={initialDigitalTwinSimulatorState}
								openDashboardTab={openDashboardTab}
								setFemResultLoaded={setFemResultLoaded}
								femResultNames={femResultNames}
								numWebWorkers={opts.numWebWorkers}
								logElapsedTime={opts.logElapsedTime}
							/>
						</MqttConnector>
					</Stage>
					<OrbitControls ref={controlsRef} mouseButtons={mouseButtons} />
				</Canvas>
				{
					(
						femSimulationObjects.length !== 0 &&
						femSimulationGeneralInfo &&
						((femResultData && opts.femSimulationResult !== "None result") || opts.legendToShow !== "None result") &&
						!opts.hideFemSimulationLegend
					) &&
					<>
						<SimulationLegend
							resultRenderInfo={femSimulationGeneralInfo[opts.femSimulationResult === "None result" ? opts.legendToShow : opts.femSimulationResult]}
							canvasContainerRef={canvasContainerRef}
						/>
						<MaxMinValuesContainer>
							<MaxMinFlexContainer>
								<FemMinValue ref={femMinValueRef}>Min value: 0</FemMinValue>
								<FemMaxValue ref={femMaxValueRef} >Max value: 0</FemMaxValue>
							</MaxMinFlexContainer>
						</MaxMinValuesContainer>
					</>
				}
				<HeaderContainer>
					<HeaderOptionsContainer >
						{isControlPanelOpen ?
							<CloseFolderIcon onClick={(e) => handleControlPanelOpenAndClose()} />
							:
							<OpenFolderIcon onClick={(e) => handleControlPanelOpenAndClose()} />
						}
						<MqttConnectionDiv>
							MQTT
							{isMqttConnected ? <WifiIcon /> : <NoWifiIcon />}
						</MqttConnectionDiv>
						<DashboardIcon onClick={(e) => handleOpenGrafanaDashboard()} />
						<ExitIcon onClick={(e) => close3DViewer()} />
					</HeaderOptionsContainer>
				</HeaderContainer>
				{isControlPanelOpen &&
					<StyledDataGui data={opts} onUpdate={setOpts} style={datGuiStyle} >
						<DatFolder title='Lights' closed={true}>
							<DatFolder title='Environment' closed={true}>
								<StyledDatSelect
									path='environment'
									label='Select: '
									options={environmentOptions}
								/>
							</DatFolder>
							<DatFolder title='Ambient light' closed={true}>
								<StyledDatNumber label="Intensity" path="ambientLightIntensity" min={0} max={10} step={0.05} />
								<StyledDatBoolean label="Switch on/off" path="ambientLigth" />
							</DatFolder>
							<DatFolder title='Spot light' closed={true}>
								<StyledDatNumber label="Power (lm)" path="spotLightPower" min={0} max={5000} step={5} />
								<StyledDatBoolean label="Switch on/off" path="spotLight" />
								<StyledDatBoolean label="Show helper" path="showSpotLightHelper" />
							</DatFolder>
							<DatFolder title='Point light' closed={true}>
								<StyledDatNumber label="Power (lm)" path="pointLightPower" min={0} max={5000} step={10} />
								<StyledDatBoolean label="Switch on/off" path="pointLight" />
								<StyledDatBoolean label="Show helper" path="showPointLightHelper" />
							</DatFolder>
							<DatFolder title='Shadows' closed={true}>
								<StyledDatBoolean label="Show shadows" path="showShadows" />
							</DatFolder>
						</DatFolder>
						<DatFolder title='Axes' closed={true}>
							<StyledDatBoolean label="Show" path="showAxes" />
						</DatFolder>
						<DatFolder title='Web workers preferences' closed={true}>
							<StyledDatNumber
								label="Num workers"
								path="numWebWorkers"
								min={1}
								max={window.navigator.hardwareConcurrency || 1}
								step={1} />
							<StyledDatBoolean label="Log time" path="logElapsedTime" />
						</DatFolder>
						{
							sensorObjects.length !== 0 &&
							<DatFolder title='Sensors' closed={true}>
								<DatFolder
									title={sensorCollectionNames.length > 1 ?
										'All nodes'
										:
										sensorCollectionNames[0]
									}
									closed={true}
								>
									<StyledDatNumber label="Opacity" path="sensorsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllSensors" />
									<StyledDatBoolean label="Sensor marker" path="showAllSensorsMarker" />
									<StyledDatBoolean label="Hide" path="hideAllSensors" />
								</DatFolder>
								{
									((sensorCollectionNames.length > 1) ? sensorCollectionNames : []
									).map(collecionName =>
										<DatFolder key={collecionName} title={collecionName} closed={true}>
											<StyledDatNumber
												label="Opacity"
												path={`sensorsVisibilityState[${collecionName}].opacity`}
												min={0}
												max={1}
												step={0.05}
											/>
											<StyledDatBoolean
												label="Highlight"
												path={`sensorsVisibilityState[${collecionName}].highlight`}
											/>
											<StyledDatBoolean
												label="Sensor marker"
												path={`sensorsVisibilityState[${collecionName}].showSensorMarker`}
											/>
											<StyledDatBoolean
												label="Hide"
												path={`sensorsVisibilityState[${collecionName}].hide`}
											/>
										</DatFolder>
									)
								}
							</DatFolder>
						}
						{
							assetObjects.length !== 0 &&
							<DatFolder title='Assests' closed={true}>
								<DatFolder
									title={assetCollectionNames.length > 1 ?
										'All nodes'
										:
										assetCollectionNames[0]
									}
									closed={true}
								>
									<StyledDatNumber label="Opacity" path="assetsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllAssets" />
									<StyledDatBoolean label="Hide" path="hideAllAssets" />
								</DatFolder>
								{
									((assetCollectionNames.length > 1) ? assetCollectionNames : []
									).map(collecionName =>
										<DatFolder key={collecionName} title={collecionName} closed={true}>
											<StyledDatNumber
												label="Opacity"
												path={`assetsVisibilityState[${collecionName}].opacity`}
												min={0}
												max={1}
												step={0.05}
											/>
											<StyledDatBoolean
												label="Highlight"
												path={`assetsVisibilityState[${collecionName}].highlight`}
											/>
											<StyledDatBoolean
												label="Hide"
												path={`assetsVisibilityState[${collecionName}].hide`}
											/>
										</DatFolder>
									)
								}
							</DatFolder>
						}
						{
							genericObjects.length !== 0 &&
							<DatFolder title='Generic objects' closed={true}>
								<DatFolder
									title={genericObjectCollectionNames.length > 1 ?
										'All nodes'
										:
										genericObjectCollectionNames[0]
									}
									closed={true}
								>
									<StyledDatNumber label="Opacity" path="genericObjectsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllGenericObjects" />
									<StyledDatBoolean label="Hide" path="hideAllGenericObjects" />
								</DatFolder>
								{
									((genericObjectCollectionNames.length > 1) ? genericObjectCollectionNames : []
									).map(collecionName =>
										<DatFolder key={collecionName} title={collecionName} closed={true}>
											<StyledDatNumber
												label="Opacity"
												path={`genericObjectsVisibilityState[${collecionName}].opacity`}
												min={0}
												max={1}
												step={0.05}
											/>
											<StyledDatBoolean
												label="Highlight"
												path={`genericObjectsVisibilityState[${collecionName}].highlight`}
											/>
											<StyledDatBoolean
												label="Hide"
												path={`genericObjectsVisibilityState[${collecionName}].hide`}
											/>
										</DatFolder>
									)
								}
							</DatFolder>
						}
						{
							femSimulationObjects.length !== 0
							&&
							<DatFolder title='Fem objects' closed={true}>
								<DatFolder
									title={femSimObjectCollectionNames.length > 1 ?
										'All nodes'
										:
										femSimObjectCollectionNames[0]
									}
									closed={true}
								>
									<StyledDatSelect
										path='femResultDate'
										label='Date'
										options={femResultDates}
									/>
									<StyledDatSelect
										path='femSimulationResult'
										label='Results'
										options={["None result", ...femResultNames]}
									/>
									<StyledDatBoolean label="Deformation" path="showFemSimulationDeformation" />
									<StyledDatNumber
										label="Log def. scale"
										path="femSimulationDefScale"
										min={-2}
										max={10}
										step={0.01}
									/>
									<StyledDatBoolean label="Show meshes" path="showAllFemSimulationMeshes" />
									<StyledDatNumber label="Opacity" path="femSimulationObjectsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllFemSimulationObjects" />
									<StyledDatBoolean label="Hide objects" path="hideAllFemSimulationObjects" />
									<StyledDatSelect
										path='legendToShow'
										label='Legend'
										options={["None result", ...femResultNames]}
									/>
									<StyledDatBoolean label="Hide legend" path="hideFemSimulationLegend" />
								</DatFolder>
								{
									((femSimObjectCollectionNames.length > 1) ? femSimObjectCollectionNames : []
									).map(collecionName =>
										<DatFolder key={collecionName} title={collecionName} closed={true}>
											<StyledDatSelect
												path={`femSimulationObjectsVisibilityState[${collecionName}].femSimulationResult`}
												label='Results'
												options={["None result", ...femResultNames]}
											/>
											<StyledDatBoolean
												label="Deformation"
												path={`femSimulationObjectsVisibilityState[${collecionName}].showDeformation`}
											/>
											<StyledDatBoolean
												label="Show mesh"
												path={`femSimulationObjectsVisibilityState[${collecionName}].showMesh`}
											/>
											<StyledDatNumber
												label="Opacity"
												path={`femSimulationObjectsVisibilityState[${collecionName}].opacity`}
												min={0}
												max={1}
												step={0.05}
											/>
											<StyledDatBoolean
												label="Highlight"
												path={`femSimulationObjectsVisibilityState[${collecionName}].highlight`}
											/>
											<StyledDatBoolean
												label="Hide"
												path={`femSimulationObjectsVisibilityState[${collecionName}].hide`}
											/>
										</DatFolder>
									)
								}
							</DatFolder>
						}
						{
							(Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat).length !== 0) &&
							<DatFolder title='Digital twin simulator' closed={true}>
								{
									Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat).map(paramName => {
										let label = paramName;
										const dtsLabel = digitalTwinGltfData.digitalTwinSimulationFormat[paramName].label;
										const dtsUnits = digitalTwinGltfData.digitalTwinSimulationFormat[paramName].units;
										if (dtsLabel !== undefined && dtsUnits !== undefined) {
											label = `${dtsLabel} (${dtsUnits}) :`
										}
										return <StyledDatNumberDTSimulator
											key={label}
											label={label}
											path={`digitalTwinSimulatorState[${paramName}]`}
											min={digitalTwinGltfData.digitalTwinSimulationFormat[paramName].minValue}
											max={digitalTwinGltfData.digitalTwinSimulationFormat[paramName].maxValue}
											step={digitalTwinGltfData.digitalTwinSimulationFormat[paramName].step}
										/>
									})
								}
								<StyledDatButtom label={getLastMeasurementsButtomLabel} onClick={handleGetLastMeasurementsButton} />
								<StyledDatButtom label={lockReadingButtomLabel} onClick={handleLockReadMeasurementsButtonClick} />
							</DatFolder>
						}
					</StyledDataGui>
				}
				<SelectedObjectInfoContainer>
					<ObjectInfoContainer>
						<ObjectInfo ref={selectedObjNameRef}>Name: -</ObjectInfo>
						<ObjectInfo ref={selectedObjTypeRef} >Type: -</ObjectInfo>
						<ObjectInfo ref={selectedObjCollectionNameRef}>Collection: -</ObjectInfo>
					</ObjectInfoContainer>
				</SelectedObjectInfoContainer>
			</CanvasContainer>
		</>
	)
}

export default DigitalTwin3DViewer;


