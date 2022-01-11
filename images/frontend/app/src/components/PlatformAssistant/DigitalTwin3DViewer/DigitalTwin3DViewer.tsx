import { FC, useEffect, useRef, useState } from 'react'
import styled from "styled-components";
import { FaShareSquare, FaFolderOpen, FaFolderMinus } from "react-icons/fa";
import { RiWifiLine, RiWifiOffLine } from "react-icons/ri";
import { Connector } from 'mqtt-react-hooks';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei';
import DatGui, { DatNumber, DatFolder, DatBoolean, DatSelect } from "react-dat-gui";
import "react-dat-gui/dist/dist/index.css";
import { Stage } from "./Stage";
import Model, { IAnimatedObject, IAssetObject, IFemSimulationObject, IGenericObject, ISensorObject } from './Model'
import {
	AnimatedObjectState,
	AssetState,
	FemSimulationObjectState,
	ObjectVisibilityState,
	IDigitalTwinGltfData,
	SensorState,
} from './ViewerUtils';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { getDomainName } from '../../../tools/tools';
import SimulationLegend from './SimulationLegend';
import SetGltfObjects from './SetGlftOjbects';
import SetFemSimulationObject from './SetFemSimulationObject';


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

interface Viewer3DProps {
	digitalTwinSelected: IDigitalTwin | null;
	digitalTwinGltfData: IDigitalTwinGltfData;
	close3DViewer: () => void;
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

const DigitalTwin3DViewer: FC<Viewer3DProps> = ({
	digitalTwinSelected,
	digitalTwinGltfData,
	close3DViewer
}) => {
	const canvasContainerRef = useRef(null);
	const canvasRef = useRef(null);
	const controlsRef = useRef() as any;
	const selectedObjTypeRef = useRef(null);
	const selectedObjNameRef = useRef(null);
	const selectedObjTopicIdRef = useRef(null);
	const [isMqttConnected, setIsMqttConnected] = useState(false);
	const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
	const [sensorObjects, setSensorObjects] = useState<ISensorObject[]>([]);
	const [assetObjects, setAssetObjects] = useState<IAssetObject[]>([]);
	const [animatedObjects, setAnimatedObjects] = useState<IAnimatedObject[]>([]);
	const [genericObjects, setGenericObjects] = useState<IGenericObject[]>([]);
	const [femSimulationObject, setFemSimulationObjects] = useState<IFemSimulationObject | null>(null);
	const [initialSensorsState, setInitialSensorsState] = useState<Record<string, SensorState> | null>(null);
	const [initialAssetsState, setInitialAssetsState] = useState<Record<string, AssetState> | null>(null);
	const [initialAnimatedObjectsState, setInitialAnimatedObjectsState] = useState<Record<string, AnimatedObjectState> | null>(null);
	const [initialFemSimulationObjectState, setInitialFemSimulationObjectState] = useState<FemSimulationObjectState | null>(null);
	const [
		initialGenericObjectsVisibilityState,
		setInitialGenericObjectsVisibilityState
	] = useState<Record<string, ObjectVisibilityState> | null>(null);
	const [initialSensorsVisibilityState, setInitialSensorsVisibilityState] = useState<Record<string, ObjectVisibilityState> | null>(null);
	const [initialAssetsVisibilityState, setInitialAssetsVisibilityState] = useState<Record<string, ObjectVisibilityState> | null>(null);
	const [initialAnimatedObjsVisibilityState, setInitialAnimatedObjsVisibilityState] = useState<Record<string, ObjectVisibilityState> | null>(null);


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
		highlightFemSimulationObject: false,
		hideFemSimulationObject: false,
		hideFemSimulationLegend: false,
		femSimulationResult: "None result",
		showFemSimulationDeformation: false,
		femSimulationDefScale: 0,
		showFemSimulationMesh: false,
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
		if (initialAnimatedObjsVisibilityState) {
			setOpts((prevOpts) => {
				const newOpts = { ...prevOpts };
				newOpts.animatedObjectsVisibilityState = initialAnimatedObjsVisibilityState;
				return newOpts;
			})
		}
	}, [initialAnimatedObjsVisibilityState])

	useEffect(() => {
		return () => {
			if (femSimulationObject) {
				for (const fieldName in femSimulationObject.resultsRenderInfo) {
					femSimulationObject.resultsRenderInfo[fieldName].legendRenderer.forceContextLoss();
				}
			}
		}
	}, [femSimulationObject])

	return (
		<>
			{
				digitalTwinGltfData.digitalTwinGltfUrl &&
				<SetGltfObjects
					digitalTwinGltfData={digitalTwinGltfData}
					setSensorObjects={setSensorObjects}
					setAssetObjects={setAssetObjects}
					setAnimatedObjects={setAnimatedObjects}
					setGenericObjects={setGenericObjects}
					setInitialSensorsState={setInitialSensorsState}
					setInitialAssetsState={setInitialAssetsState}
					setInitialAnimatedObjectsState={setInitialAnimatedObjectsState}
					setInitialGenericObjectsVisibilityState={setInitialGenericObjectsVisibilityState}
					setInitialSensorsVisibilityState={setInitialSensorsVisibilityState}
					setInitialAssetsVisibilityState={setInitialAssetsVisibilityState}
					setInitialAnimatedObjsVisibilityState={setInitialAnimatedObjsVisibilityState}
				/>
			}
			{
				digitalTwinGltfData.femSimulationUrl &&
				<SetFemSimulationObject
					digitalTwinGltfData={digitalTwinGltfData}
					setFemSimulationObjects={setFemSimulationObjects}
					setInitialFemSimulationObjectState={setInitialFemSimulationObjectState}
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
								sensorObjects={sensorObjects}
								initialSensorsState={initialSensorsState as Record<string, SensorState>}
								sensorsVisibilityState={opts.sensorsVisibilityState}
								assetObjects={assetObjects}
								initialAssetsState={initialAssetsState as Record<string, SensorState>}
								assetsVisibilityState={opts.assetsVisibilityState}
								animatedObjects={animatedObjects}
								initialAnimatedObjectsState={initialAnimatedObjectsState as Record<string, AnimatedObjectState>}
								animatedObjectsVisibilityState={opts.animatedObjectsVisibilityState}
								femSimulationObject={femSimulationObject as IFemSimulationObject}
								initialFemSimulationObjectState={initialFemSimulationObjectState as FemSimulationObjectState}
								genericObjects={genericObjects}
								genericObjectsVisibilityState={opts.genericObjectsVisibilityState}
								mqttTopics={digitalTwinGltfData.mqttTopics}
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
								hideFemSimulationObject={opts.hideFemSimulationObject}
								showFemSimulationDeformation={opts.showFemSimulationDeformation}
								highlightFemSimulationObject={opts.highlightFemSimulationObject}
								showFemSimulationMesh={opts.showFemSimulationMesh}
								genericObjectsOpacity={opts.genericObjectsOpacity}
								highlightAllGenericObjects={opts.highlightAllGenericObjects}
								hideAllGenericObjects={opts.hideAllGenericObjects}
								setIsMqttConnected={isMqttConnected => setIsMqttConnected(isMqttConnected)}
								canvasRef={canvasRef}
								selectedObjTypeRef={selectedObjTypeRef}
								selectedObjNameRef={selectedObjNameRef}
								selectedObjTopicIdRef={selectedObjTopicIdRef}
								femSimulationResult={opts.femSimulationResult}
								femSimulationDefScale={opts.femSimulationDefScale}
							/>
						</Connector>
					</Stage>
					<OrbitControls ref={controlsRef} mouseButtons={mouseButtons} />
				</Canvas>
				{(femSimulationObject && opts.femSimulationResult !== "None result" && !opts.hideFemSimulationLegend) &&
					<SimulationLegend
						resultRenderInfo={femSimulationObject.resultsRenderInfo[opts.femSimulationResult]}
						canvasContainerRef={canvasContainerRef}
					/>
				}
				<HeaderContainer>
					<HeaderOptionsContainer >
						{isControlPanelOpen ?
							<CloseFolderIcon onClick={(e) => setIsControlPanelOpen(false)} />
							:
							<OpenFolderIcon onClick={(e) => setIsControlPanelOpen(true)} />
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
								{initialSensorsVisibilityState &&
									Object.keys(initialSensorsVisibilityState as Record<string, ObjectVisibilityState>).map(collecionName =>
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
								{initialAssetsVisibilityState &&
									Object.keys(initialAssetsVisibilityState as Record<string, ObjectVisibilityState>).map(collecionName =>
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
							animatedObjects.length !== 0 &&
							<DatFolder title='Animated objects' closed={true}>
								<DatFolder title='All nodes' closed={true}>
									<StyledDatNumber label="Opacity" path="animatedObjectsOpacity" min={0} max={1} step={0.05} />
									<StyledDatBoolean label="Highlight" path="highlightAllAnimatedObjects" />
									<StyledDatBoolean label="Hide" path="hideAllAnimatedObjects" />
								</DatFolder>
								{initialAnimatedObjsVisibilityState &&
									Object.keys(initialAnimatedObjsVisibilityState as Record<string, ObjectVisibilityState>).map(collecionName =>
										<DatFolder key={collecionName} title={collecionName} closed={true}>
											<StyledDatNumber
												label="Opacity"
												path={`animatedObjectsVisibilityState[${collecionName}].opacity`}
												min={0}
												max={1}
												step={0.05}
											/>
											<StyledDatBoolean
												label="Highlight"
												path={`animatedObjectsVisibilityState[${collecionName}].highlight`}
											/>
											<StyledDatBoolean
												label="Hide"
												path={`animatedObjectsVisibilityState[${collecionName}].hide`}
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
								{initialGenericObjectsVisibilityState &&
									Object.keys(initialGenericObjectsVisibilityState as Record<string, ObjectVisibilityState>).map(collecionName =>
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
							femSimulationObject &&
							<DatFolder title='Fem simulation object' closed={true}>
								<StyledDatSelect
									path='femSimulationResult'
									label='Results'
									options={["None result", ...Object.keys(femSimulationObject.resultFieldPaths)]}
								/>
								<StyledDatBoolean label="Deformation" path="showFemSimulationDeformation" />
								<StyledDatNumber
									label="Log def. scale"
									path="femSimulationDefScale"
									min={-2}
									max={10}
									step={0.01}
								/>
								<StyledDatBoolean label="Show mesh" path="showFemSimulationMesh" />
								<StyledDatBoolean label="Highlight" path="highlightFemSimulationObject" />
								<StyledDatBoolean label="Hide object" path="hideFemSimulationObject" />
								<StyledDatBoolean label="Hide legend" path="hideFemSimulationLegend" />
							</DatFolder>
						}
					</StyledDataGui>
				}
				<SelectedObjectInfoContainer>
					<ObjectInfoContainer>
						<ObjectInfo ref={selectedObjTypeRef} >Object type: -</ObjectInfo>
						<ObjectInfo ref={selectedObjNameRef}>Object name: -</ObjectInfo>
						<ObjectInfo ref={selectedObjTopicIdRef}>TopicId: -</ObjectInfo>
					</ObjectInfoContainer>
				</SelectedObjectInfoContainer>
			</CanvasContainer>
		</>
	)
}

export default DigitalTwin3DViewer;
