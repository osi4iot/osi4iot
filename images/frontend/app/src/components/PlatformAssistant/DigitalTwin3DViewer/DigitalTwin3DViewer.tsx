import { FC, useRef, useState } from 'react'
import styled from "styled-components";
import { Connector } from 'mqtt-react-hooks';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei';
import DatGui, { DatNumber, DatFolder, DatBoolean, DatButton, DatSelect } from "react-dat-gui";
import "react-dat-gui/dist/dist/index.css";
import { Stage } from "./Stage";
import Model, { IAnimatedObject, IAssetObject, IFemSimulationObject, ISensorObject } from './Model'
import {
  AnimatedObjectState,
  AssetState,
  FemSimulationObjectState,
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

const MqttConnectionDiv = styled.div`
  background-color: #141619;
  padding: 20px 10px;
	font-size: 12px;
	color: white;
	height: 20px;
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
`

const StyledDatBoolean = styled(DatBoolean)`
    &.cr.boolean {
      border-left: 5px solid #806787;
      background-color: #141619;

      label {
        width: 100%;
  
        .label-text {
          width: 30% !important;
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
        width: 29% !important;
      }
    }

    span {
      width: 71% !important;
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
        width: 30% !important;
      }
    }

    select {
      width: 70% !important;
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



const StyledButton = styled(DatButton)`
  &.cr.button {
    border-left: 5px solid #141619 !important;
    display: flex;
    justify-content: center;
    background-color: #141619;
    padding: 10px 0px;

    .label-text {
      display: flex !important;
      justify-content: center;
      align-items: center;
      background-color: #3274d9;
      padding: 10px 20px;
      color: white;
      border: 1px solid #2c3235;
      border-radius: 10px;
      outline: none;
      cursor: pointer;
      box-shadow: 0 5px #173b70;
      width: 80% !important;

      &:hover {
        background-color: #2461c0;
      }

      &:active {
        background-color: #2461c0;
        box-shadow: 0 2px #173b70;
        transform: translateY(4px);
      }
    }
  }
`;

interface ConnectionLedProps {
  readonly isMqttConnected: boolean;
}

const ConnectionLed = styled.span<ConnectionLedProps>`
	background-color: ${(props) => (props.isMqttConnected ? "#62f700" : "#f80000")};
	width: 12px;
	height: 12px;
	margin: -2px 10px;
	border-radius: 50%;
	border: 2px solid #ffffff;
	display: inline-block;
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
  const [sensorObjects, setSensorObjects] = useState<ISensorObject[]>([]);
  const [assetObjects, setAssetObjects] = useState<IAssetObject[]>([]);
  const [animatedObjects, setAnimatedObjects] = useState<IAnimatedObject[]>([]);
  const [femSimulationObject, setFemSimulationObjects] = useState<IFemSimulationObject | null>(null);
  const [genericObjects, setGenericObjects] = useState<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[]>([]);
  const [initialSensorsState, setInitialSensorsState] = useState<Record<string, SensorState> | null>(null);
  const [initialAssetsState, setInitialAssetsState] = useState<Record<string, AssetState> | null>(null);
  const [initialAnimatedObjectsState, setInitialAnimatedObjectsState] = useState<Record<string, AnimatedObjectState> | null>(null);
  const [initialFemSimulationObjectState, setInitialFemSimulationObjectState] = useState<FemSimulationObjectState | null>(null);


  const [opts, setOpts] = useState({
    ligthIntensity: 1,
    ambientLigth: true,
    spotLigth: true,
    pointLight: true,
    sensorsOpacity: 1,
    highlightAllSensors: false,
    assetsOpacity: 1,
    highlightAllAnimatedObjects: false,
    animatedObjectsOpacity: 1,
    highlightFemSimulationObject: false,
    femSimulationObjectHidden: false,
    highlightAllGenericObjects: false,
    genericObjectsOpacity: 1,
    highlightAllAssets: false,
    hideFemSimulationLegend: false,
    femSimulationResult: "None result"
  });

  const datGuiStyle = {
    marginTop: "205px",
    button: {
      borderLeft: "0px"
    }
  };


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
        <Canvas ref={canvasRef} dpr={window.devicePixelRatio} orthographic >
          <Stage
            controls={controlsRef}
            intensity={opts.ligthIntensity}
            ambientLigth={opts.ambientLigth}
            spotLigth={opts.spotLigth}
            pointLight={opts.pointLight}
          >
            <Connector options={mqttOptions} brokerUrl={brokerUrl}>
              <Model
                sensorObjects={sensorObjects}
                initialSensorsState={initialSensorsState as Record<string, SensorState>}
                assetObjects={assetObjects}
                initialAssetsState={initialAssetsState as Record<string, SensorState>}
                animatedObjects={animatedObjects}
                initialAnimatedObjectsState={initialAnimatedObjectsState as Record<string, AnimatedObjectState>}
                femSimulationObject={femSimulationObject as IFemSimulationObject}
                initialFemSimulationObjectState={initialFemSimulationObjectState as FemSimulationObjectState}
                genericObjects={genericObjects}
                mqttTopics={digitalTwinGltfData.mqttTopics}
                dashboardUrl={digitalTwinSelected?.dashboardUrl as string}
                sensorsOpacity={opts.sensorsOpacity}
                highlightAllSensors={opts.highlightAllSensors}
                assetsOpacity={opts.assetsOpacity}
                highlightAllAssets={opts.highlightAllAssets}
                animatedObjectsOpacity={opts.animatedObjectsOpacity}
                highlightAllAnimatedObjects={opts.highlightAllAnimatedObjects}
                femSimulationObjectHidden={opts.femSimulationObjectHidden}
                highlightFemSimulationObject={opts.highlightFemSimulationObject}
                genericObjectsOpacity={opts.genericObjectsOpacity}
                highlightAllGenericObjects={opts.highlightAllGenericObjects}
                setIsMqttConnected={isMqttConnected => setIsMqttConnected(isMqttConnected)}
                canvasRef={canvasRef}
                selectedObjTypeRef={selectedObjTypeRef}
                selectedObjNameRef={selectedObjNameRef}
                selectedObjTopicIdRef={selectedObjTopicIdRef}
                femSimulationResult={opts.femSimulationResult}
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
        <StyledDataGui data={opts} onUpdate={setOpts} style={datGuiStyle}>
          <MqttConnectionDiv>
            Mqtt connection <ConnectionLed isMqttConnected={isMqttConnected} />
          </MqttConnectionDiv>
          <DatFolder title='Ligths' closed={true}>
            <StyledDatNumber label="Intensity" path="ligthIntensity" min={0} max={5} step={0.05} />
            <StyledDatBoolean label="Ambient" path="ambientLigth" />
            <StyledDatBoolean label="Spot" path="spotLigth" />
            <StyledDatBoolean label="Point" path="pointLight" />
          </DatFolder>
          {
            sensorObjects.length !== 0 &&
            <DatFolder title='Sensors' closed={true}>
              <StyledDatNumber label="Opacity" path="sensorsOpacity" min={0} max={1} step={0.05} />
              <StyledDatBoolean label="Highlight" path="highlightAllSensors" />
            </DatFolder>
          }
          {
            assetObjects.length !== 0 &&
            <DatFolder title='Assests' closed={true}>
              <StyledDatNumber label="Opacity" path="assetsOpacity" min={0} max={1} step={0.05} />
              <StyledDatBoolean label="Highlight" path="highlightAllAssets" />
            </DatFolder>
          }
          {
            animatedObjects.length !== 0 &&
            <DatFolder title='Animated objects' closed={true}>
              <StyledDatNumber label="Opacity" path="animatedObjectsOpacity" min={0} max={1} step={0.05} />
              <StyledDatBoolean label="Highlight" path="highlightAllAnimatedObjects" />
            </DatFolder>
          }
          {
            genericObjects.length !== 0 &&
            <DatFolder title='Generic objects' closed={true}>
              <StyledDatNumber label="Opacity" path="genericObjectsOpacity" min={0} max={1} step={0.05} />
              <StyledDatBoolean label="Highlight" path="highlightAllGenericObjects" />
            </DatFolder>
          }
          {
            femSimulationObject &&
            <DatFolder title='Fem simulation object' closed={true}>
                <StyledDatSelect
                  path='femSimulationResult'
                  label='Results'
                  options={["None result", ...Object.keys(femSimulationObject.resultFieldPaths)]} />
              <StyledDatBoolean label="Highlight" path="highlightFemSimulationObject" />
                <StyledDatBoolean label="Hide mesh" path="femSimulationObjectHidden" />
                <StyledDatBoolean label="Hide legend" path="hideFemSimulationLegend" />
            </DatFolder>
          }
          <StyledButton label="Exit" onClick={(e) => close3DViewer()} />
        </StyledDataGui>
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
