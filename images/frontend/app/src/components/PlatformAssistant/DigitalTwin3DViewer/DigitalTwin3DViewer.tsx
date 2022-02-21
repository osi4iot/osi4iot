import { FC, useEffect, useRef, useState } from 'react'
import styled from "styled-components";
import { FaShareSquare, FaFolderOpen, FaFolderMinus } from "react-icons/fa";
import { RiWifiLine, RiWifiOffLine } from "react-icons/ri";
import { Connector } from 'mqtt-react-hooks';
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
} from './ViewerUtils';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { axiosAuth, axiosInstance, getDomainName } from '../../../tools/tools';
import SimulationLegend from './SimulationLegend';
import SetGltfObjects from './SetGlftOjbects';
import { useAuthDispatch, useAuthState } from '../../../contexts/authContext';


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

const domainName = getDomainName();

const brokerUrl = `wss://${domainName}`;

const mqttOptions = {
	port: 9001,
	protocol: 'wss' as 'wss',
	clientId: "clientId_" + Math.floor(Math.random() * 1000),
	retain: false
}

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
}

const DigitalTwin3DViewer: FC<Viewer3DProps> = ({
	digitalTwinSelected,
	digitalTwinGltfData,
	close3DViewer
}) => {
	const { accessToken, refreshToken } = useAuthState();
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
	const [assetObjects, setAssetObjects] = useState<IAssetObject[]>([]);
	const [genericObjects, setGenericObjects] = useState<IGenericObject[]>([]);
	const [femSimulationObjects, setFemSimulationObjects] = useState<IFemSimulationObject[]>([]);
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

	let femResultNames: string[] = [];
	if (femSimulationObjects.length !== 0 && femSimulationGeneralInfo) {
		femResultNames = digitalTwinGltfData.femSimulationData.metadata.resultFields.map(
			(resultField: { resultName: string; }) => resultField.resultName
		);
	}


	const handleGetLastMeasurementsButton = () => {
		const digitalTwinSimulationFormat = digitalTwinGltfData.digitalTwinSimulationFormat;
		if (digitalTwinSelected && Object.keys(digitalTwinSimulationFormat).length !== 0) {
			const topicsIdArray: number[] = [];
			Object.keys(digitalTwinSimulationFormat).forEach(field => {
				if (digitalTwinSimulationFormat[field].topicId !== undefined) {
					const topicId = digitalTwinSimulationFormat[field].topicId;
					if (!topicsIdArray.includes(topicId)) topicsIdArray.push(topicId);
				}
			})

			if (topicsIdArray.length !== 0) {
				setGetLastMeasurementsButtomLabel("LOADING...");
				const groupId = digitalTwinSelected.groupId
				const urlLastMeasurements = `https://${domainName}/admin_api/measurements_last_from_topicsid_array/${groupId}/`;
				const config = axiosAuth(accessToken);
				const topicsIdArrayObj = { topicsIdArray }
				axiosInstance(refreshToken, authDispatch)
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
						console.log(error);
						setGetLastMeasurementsButtomLabel("GET LAST MEASUREMENTS");
					});
			}
		}
	}

	const handleLockReadMeasurementsButtonClick = () => {
		if (lockReadingButtomLabel === "LOCK READ MEASUREMENTS") {
			setLockReadingButtomLabel("UNLOCK READ MEASUREMENTS")
		} else if (lockReadingButtomLabel === "UNLOCK READ MEASUREMENTS") {
			handleGetLastMeasurementsButton();
			setLockReadingButtomLabel("LOCK READ MEASUREMENTS")
		}
		setDigitalTwinSimulatorSendData(prevState => !prevState);
	}

	const handleControlPanelOpenAndClose = () => {
		if (isControlPanelOpen) setIsControlPanelOpen(false);
		else {
			handleGetLastMeasurementsButton();
			setIsControlPanelOpen(true);
		}
	}

	const [opts, setOpts] = useState({
		ambientLight: true,
		ambientLightIntensity: 1,
		spotLight: true,
		spotLightPower: 100,
		showSpotLightHelper: false,
		pointLight: true,
		pointLightPower: 100,
		showPointLightHelper: false,
		showAxes: false,
		showShadows: true,
		sensorsOpacity: 1,
		highlightAllSensors: false,
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
		showFemSimulationDeformation: false,
		femSimulationDefScale: 0,
		showAllFemSimulationMeshes: false,
		legendToShow: "None result",
		digitalTwinSimulatorState: undefined as unknown as Record<string, number>,
	});

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
		return () => {
			if (femSimulationObjects.length !== 0 && femSimulationGeneralInfo) {
				for (let resulName of femResultNames) {
					femSimulationGeneralInfo[resulName].legendRenderer.forceContextLoss();
				}
			}
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
		if (opts.femSimulationResult !== "None result" && femMinValues.length !== 0 && femMinValueRef && femMinValueRef.current) {
			const femMinValuesFiltered: number[] = [];
			if (!opts.hideAllFemSimulationObjects) {
				femSimulationObjects.forEach((obj, index) => {
					const collectionName = obj.collectionName;
					if (!opts.femSimulationObjectsVisibilityState[collectionName].hide) femMinValuesFiltered.push(femMinValues[index]);
				});
			}

			if (femMinValuesFiltered.length !== 0) {
				const sortedFemMinValues = femMinValuesFiltered.slice().sort((a, b) => a - b);
				const resultFields = digitalTwinGltfData.femSimulationData.metadata.resultFields;
				const resultFieldFiltered = resultFields.filter((result: { resultName: string; }) => result.resultName === opts.femSimulationResult)[0];
				const units = resultFieldFiltered.units;
				(femMinValueRef.current as any).innerHTML = `Min value: ${sortedFemMinValues[0].toExponential(4)} ${units}`;
			} else {
				(femMinValueRef.current as any).innerHTML = "Min value: -";
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		opts.femSimulationResult,
		opts.hideAllFemSimulationObjects,
		opts.femSimulationObjectsVisibilityState,
		femMinValueRef,
		femMinValues
	]);

	useEffect(() => {
		if (opts.femSimulationResult !== "None result" && femMaxValues.length !== 0 && femMaxValueRef && femMaxValueRef.current) {
			const femMaxValuesFiltered: number[] = [];
			if (!opts.hideAllFemSimulationObjects) {
				femSimulationObjects.forEach((obj, index) => {
					const collectionName = obj.collectionName;
					if (!opts.femSimulationObjectsVisibilityState[collectionName].hide) femMaxValuesFiltered.push(femMaxValues[index]);
				});
			}

			if (femMaxValuesFiltered.length !== 0) {
				const sortedFemMaxValues = femMaxValuesFiltered.slice().sort((a, b) => b - a);
				const resultFields = digitalTwinGltfData.femSimulationData.metadata.resultFields;
				const resultFieldFiltered = resultFields.filter((result: { resultName: string; }) => result.resultName === opts.femSimulationResult)[0];
				const units = resultFieldFiltered.units;
				(femMaxValueRef.current as any).innerHTML = `Max value: ${sortedFemMaxValues[0].toExponential(4)} ${units}`;
			} else {
				(femMaxValueRef.current as any).innerHTML = "Max value: -";
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
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
					digitalTwinSelected={digitalTwinSelected}
					digitalTwinGltfData={digitalTwinGltfData}
					setSensorObjects={setSensorObjects}
					setAssetObjects={setAssetObjects}
					setGenericObjects={setGenericObjects}
					setFemSimulationObjects={setFemSimulationObjects}
					setInitialSensorsState={setInitialSensorsState}
					setInitialAssetsState={setInitialAssetsState}
					setInitialGenericObjectsState={setInitialGenericObjectsState}
					setInitialFemSimObjectsState={setInitialFemSimObjectsState}
					setFemSimulationGeneralInfo={setFemSimulationGeneralInfo}
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
				>
					<Stage
						controls={controlsRef}
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
					>
						<Connector options={mqttOptions} brokerUrl={brokerUrl}>
							<Model
								digitalTwinGltfData={digitalTwinGltfData}
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
								dashboardUrl={digitalTwinSelected?.dashboardUrl as string}
								sensorsOpacity={opts.sensorsOpacity}
								highlightAllSensors={opts.highlightAllSensors}
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
								initialDigitalTwinSimulatorState={initialDigitalTwinSimulatorState}
							/>
						</Connector>
					</Stage>
					<OrbitControls ref={controlsRef} mouseButtons={mouseButtons} />
				</Canvas>
				{
					(
						femSimulationObjects.length !== 0 &&
						femSimulationGeneralInfo &&
						(opts.femSimulationResult !== "None result" || opts.legendToShow !== "None result") &&
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
							// <CloseFolderIcon onClick={(e) => setIsControlPanelOpen(false)} />
							// :
							// <OpenFolderIcon onClick={(e) => setIsControlPanelOpen(true)} />
							<CloseFolderIcon onClick={(e) => handleControlPanelOpenAndClose()} />
							:
							<OpenFolderIcon onClick={(e) => handleControlPanelOpenAndClose()} />
						}
						<MqttConnectionDiv>
							MQTT
							{isMqttConnected ? <WifiIcon /> : <NoWifiIcon />}
						</MqttConnectionDiv>
						<ExitIcon onClick={(e) => close3DViewer()} />
					</HeaderOptionsContainer>
				</HeaderContainer>
				{isControlPanelOpen &&
					<StyledDataGui data={opts} onUpdate={setOpts} style={datGuiStyle} >
						<DatFolder title='Lights' closed={true}>
							<DatFolder title='Ambient light' closed={true}>
								<StyledDatNumber label="Intensity" path="ambientLightIntensity" min={0} max={10} step={0.05} />
								<StyledDatBoolean label="Switch on/off" path="ambientLigth" />
							</DatFolder>
							<DatFolder title='Spot light' closed={true}>
								<StyledDatNumber label="Power (lm)" path="spotLightPower" min={0} max={5000} step={10} />
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
						{
							sensorObjects.length !== 0 &&
							<DatFolder title='Sensors' closed={true}>
								<DatFolder title='All nodes' closed={true}>
									<StyledDatNumber label="Opacity" path="sensorsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllSensors" />
									<StyledDatBoolean label="Hide" path="hideAllSensors" />
								</DatFolder>
								{
									(
										(Object.keys(initialSensorsVisibilityState || []).length > 1) ?
											Object.keys(initialSensorsVisibilityState || []) : []
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
								<DatFolder title='All nodes' closed={true}>
									<StyledDatNumber label="Opacity" path="assetsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllAssets" />
									<StyledDatBoolean label="Hide" path="hideAllAssets" />
								</DatFolder>
								{
									(
										(Object.keys(initialAssetsVisibilityState || []).length > 1) ?
											Object.keys(initialAssetsVisibilityState || []) : []
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
								<DatFolder title='All nodes' closed={true}>
									<StyledDatNumber label="Opacity" path="genericObjectsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllGenericObjects" />
									<StyledDatBoolean label="Hide" path="hideAllGenericObjects" />
								</DatFolder>
								{
									(
										(Object.keys(initialGenericObjectsVisibilityState || []).length > 1) ?
											Object.keys(initialGenericObjectsVisibilityState || []) : []
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
							(femSimulationObjects.length !== 0 && femSimulationGeneralInfo) &&
							<DatFolder title='Fem objects' closed={true}>
								<DatFolder title='All meshes' closed={true}>
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
									initialFemSimObjectsVisibilityState &&
									Object.keys(initialFemSimObjectsVisibilityState).map(collecionName =>
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
									Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat).map(paramName =>
										<StyledDatNumberDTSimulator
											label={`${digitalTwinGltfData.digitalTwinSimulationFormat[paramName].label || paramName}:`}
											path={`digitalTwinSimulatorState[${paramName}]`}
											min={digitalTwinGltfData.digitalTwinSimulationFormat[paramName].minValue}
											max={digitalTwinGltfData.digitalTwinSimulationFormat[paramName].maxValue}
											step={digitalTwinGltfData.digitalTwinSimulationFormat[paramName].step}
										/>
									)
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
