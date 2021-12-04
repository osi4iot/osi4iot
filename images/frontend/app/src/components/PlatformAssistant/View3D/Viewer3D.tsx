import React, { FC, useEffect, useRef, useState } from 'react'
import styled from "styled-components";
import { Connector } from 'mqtt-react-hooks';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import DatGui, { DatColor, DatNumber, DatFolder, DatBoolean, DatButton } from "react-dat-gui";
import "react-dat-gui/dist/dist/index.css";
import { Stage } from "./Stage";
import Model, { AssetObject, SensorObject } from './Model'
import {
  centerScene,
  loader,
  sortObjects
} from './ViewerUtils';
import { sample1 } from './Data';


interface CanvasContainerProps {
  isCursorInsideObject: boolean;
}

const CanvasContainer = styled.div<CanvasContainerProps>`
	background-color: #212121;
  height: 100%;
  color: white;
  width: calc(100vw - 60px);
  &:hover {
    cursor: ${(props) => props.isCursorInsideObject ? "pointer" : "default"};
  }
`;

const MqttConnectionDiv = styled.div`
  background-color: #000000;
  padding: 20px 10px;
	font-size: 12px;
	color: white;
	height: 20px;
`;

const SelectedObjectInfoContainer = styled.div`
    background-color: #000000;
    margin: 5px 10px;
    padding: 5px;
    color: white;
    position: fixed;
    bottom: 0;
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

const StyledDatBoolean = styled(DatBoolean)`
    &.cr.boolean {
      border-left: 5px solid #806787;
      background-color: #000000;
    }
`;

const StyledDatNumber = styled(DatNumber)`
  &.cr.number {
    border-left: 5px solid #806787;
    background-color: #000000;
  }
`;

const StyledDatColor = styled(DatColor)`
  &.cr.color {
    border-left: 5px solid #806787 !important;
    background-color: #000000;
  }
`;

const StyledButton = styled(DatButton)`
  &.cr.button {
    border-left: 5px solid #000000 !important;
    display: flex;
    justify-content: center;
    background-color:#000000;
    padding: 10px 0px;

    .label-text {
      display: flex;
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
      width: 80%;

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

const mqttOptions = {
  port: 9001,
  protocol: 'ws' as 'ws',
  host: "localhost"
}

interface Viewer3DProps {
  closeViewer3D: () => void;
}

const Viewer3D: FC<Viewer3DProps> = ({ closeViewer3D }) => {
  const canvasRef = useRef(null);
  const controlsRef = useRef() as any;
  const [isMqttConnected, setIsMqttConnected] = useState(false);
  const [isCursorInsideObject, setIsCursorInsideObject] = useState(false);
  const [sensorObjects, setSensorObjects] = useState<SensorObject[]>([]);
  const [assetObjects, setAssetObjects] = useState<AssetObject[]>([]);
  const [genericObjects, setGenericObjects] = useState<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[]>([]);
  const [mqttTopics, setMqttTopics] = useState<string[]>([]);
  const [dashboardsUrl, setDashboardsUrl] = useState<string[]>([]);
  const [selectedObjectInfo, setSelectedObjectInfo] = useState({ type: "-", name: "-", dashboardId: "-", topicId: "-" });

  useEffect(() => {
    loader.parse(sample1, "", (gltf: any) => {
      const scene = gltf.scene;
      centerScene(scene);
      const {
        sensorObjects,
        assetObjects,
        genericObjects,
        topicsId,
        dashboardsId
      } = sortObjects(scene);
      setSensorObjects(sensorObjects);
      setAssetObjects(assetObjects);
      setGenericObjects(genericObjects);
      //Buscar en base de datos mqttTopics y dashboardsUrl
      console.log("topicsId= ", topicsId);
      console.log("dashboardId= ", dashboardsId)
      const mqttTopics = ["test/asset", "test/sensor"];
      setMqttTopics(mqttTopics);
      const dashboardsUrl = [
        "https://iot.eebe.upc.edu/grafana/d/1f149d41-3052-45fb-8b36-f9f89b17c755/eebe_gral_temp_demo",
        "https://iot.eebe.upc.edu/grafana/d/5f06c6ab-4572-4fda-a595-bea96a6a3725/eebe_gral_accel_demo"
      ];
      setDashboardsUrl(dashboardsUrl);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [opts, setOpts] = useState({
    ligthIntensity: 1,
    ambientLigth: true,
    spotLigth: true,
    pointLight: true,
    sensorsColor: "#23272F",
    highlightAllSensors: false,
    highlightAllAssets: false,
    assetsColor: "#292828",
  });

  const datGuiStyle = {
    marginTop: "100px",
    button: {
      borderLeft: "0px"
    }
  };

  return (
    <CanvasContainer isCursorInsideObject={isCursorInsideObject}>
      <Canvas ref={canvasRef} dpr={window.devicePixelRatio} orthographic>
        <Stage
          controls={controlsRef}
          intensity={opts.ligthIntensity}
          ambientLigth={opts.ambientLigth}
          spotLigth={opts.spotLigth}
          pointLight={opts.pointLight}
        >
          <Connector options={mqttOptions}>
            <Model
              sensorObjects={sensorObjects}
              assetObjects={assetObjects}
              genericObjects={genericObjects}
              mqttTopics={mqttTopics}
              dashboardsUrl={dashboardsUrl}
              setSelectedObjectInfo={(selectedObjectInfo) => setSelectedObjectInfo(selectedObjectInfo)}
              sensorsColor={opts.sensorsColor}
              highlightAllSensors={opts.highlightAllSensors}
              assetsColor={opts.assetsColor}
              highlightAllAssets={opts.highlightAllAssets}
              setIsMqttConnected={isMqttConnected => setIsMqttConnected(isMqttConnected)}
              setIsCursorInsideObject={isCursorInsideObject => setIsCursorInsideObject(isCursorInsideObject)}
              canvasRef={canvasRef}
            />
          </Connector>
        </Stage>
        <OrbitControls ref={controlsRef} />
      </Canvas>
      <DatGui data={opts} onUpdate={setOpts} style={datGuiStyle}>
        <MqttConnectionDiv>
          Mqtt connection <ConnectionLed isMqttConnected={isMqttConnected} />
        </MqttConnectionDiv>
        <DatFolder title='Ligths' closed={true}>
          <StyledDatNumber label="Ligth intensity" path="ligthIntensity" min={0} max={5} step={0.05} />
          <StyledDatBoolean label="Ambient ligth" path="ambientLigth" />
          <StyledDatBoolean label="Spot ligth" path="spotLigth" />
          <StyledDatBoolean label="Point ligth" path="pointLight" />
        </DatFolder>
        <DatFolder title='Sensors' closed={true}>
          <StyledDatBoolean label="Highlight sensors" path="highlightAllSensors" />
          <StyledDatColor label="Sensors color" path="sensorsColor" />
        </DatFolder>
        <DatFolder title='Assests' closed={true}>
          <StyledDatBoolean label="Highlight assets" path="highlightAllAssets" />
          <StyledDatColor label="Assests color" path="assetsColor" />
        </DatFolder>
        <StyledButton label="Exit" onClick={(e) => closeViewer3D()} />
      </DatGui>
      <SelectedObjectInfoContainer>
        {/* <SelectedObjectInfoTitle>Selected object:</SelectedObjectInfoTitle> */}
        <ObjectInfoContainer>
          <ObjectInfo>Object type: {selectedObjectInfo.type}</ObjectInfo>
          <ObjectInfo>Object name: {selectedObjectInfo.name}</ObjectInfo>
          <ObjectInfo>DasboardId: {selectedObjectInfo.dashboardId}</ObjectInfo>
          <ObjectInfo>TopicId: {selectedObjectInfo.topicId}</ObjectInfo>
        </ObjectInfoContainer>
      </SelectedObjectInfoContainer>
    </CanvasContainer>
  )
}

export default Viewer3D;
