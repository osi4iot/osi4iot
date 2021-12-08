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
// import { sample1 } from './Data';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import { getDomainName } from '../../../tools/tools';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';


interface CanvasContainerProps {
  isCursorInsideObject: boolean;
}

const CanvasContainer = styled.div<CanvasContainerProps>`
	background-color: #212121;
  height: 100%;
  color: white;
  width: 100%;
  &:hover {
    cursor: ${(props) => props.isCursorInsideObject ? "pointer" : "default"};
  }
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

const StyledDatGui = styled(DatGui)`
  .react-dat-gui .dg  {
    border-radius: 10px;
  }
`;

const StyledDatFolder = styled(DatFolder)`
  .title {
    background-color: #141619 !important;
  }
`;

const StyledDatBoolean = styled(DatBoolean)`
    &.cr.boolean {
      border-left: 5px solid #806787;
      background-color: #141619;
    }
`;

const StyledDatNumber = styled(DatNumber)`
  &.cr.number {
    border-left: 5px solid #806787;
    background-color: #141619;
  }
`;

const StyledDatColor = styled(DatColor)`
  &.cr.color {
    border-left: 5px solid #806787 !important;
    background-color: #141619;
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

const mqttOptions = {
  port: 9001,
  // protocol: 'ws' as 'ws',
  protocol: 'wss' as 'wss',
  host: domainName
}

interface Viewer3DProps {
  groupSelected: IGroupManaged | null;
  digitalTwinSelected: IDigitalTwin | null;
  close3DViewer: () => void;
}

const DigitalTwin3DViewer: FC<Viewer3DProps> = ({
  groupSelected,
  digitalTwinSelected,
  close3DViewer
}) => {
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
    if (groupSelected && digitalTwinSelected) {
      loader.parse(JSON.stringify(digitalTwinSelected.gltfData), "", (gltf: any) => {
        const scene = gltf.scene;
        centerScene(scene);
        const {
          sensorObjects,
          assetObjects,
          genericObjects
        } = sortObjects(scene);
        setSensorObjects(sensorObjects);
        setAssetObjects(assetObjects);
        setGenericObjects(genericObjects);
        setMqttTopics(digitalTwinSelected.mqttTopics as string[]);
        setDashboardsUrl(digitalTwinSelected.dashboardUrls as string[]);
      });

    }
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
    marginTop: "205px",
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
      <StyledDatGui data={opts} onUpdate={setOpts} style={datGuiStyle}>
        <MqttConnectionDiv>
          Mqtt connection <ConnectionLed isMqttConnected={isMqttConnected} />
        </MqttConnectionDiv>
        <StyledDatFolder title='Ligths' closed={true}>
          <StyledDatNumber label="Ligth intensity" path="ligthIntensity" min={0} max={5} step={0.05} />
          <StyledDatBoolean label="Ambient ligth" path="ambientLigth" />
          <StyledDatBoolean label="Spot ligth" path="spotLigth" />
          <StyledDatBoolean label="Point ligth" path="pointLight" />
        </StyledDatFolder>
        <StyledDatFolder title='Sensors' closed={true}>
          <StyledDatBoolean label="Highlight sensors" path="highlightAllSensors" />
          <StyledDatColor label="Sensors color" path="sensorsColor" />
        </StyledDatFolder>
        <StyledDatFolder title='Assests' closed={true}>
          <StyledDatBoolean label="Highlight assets" path="highlightAllAssets" />
          <StyledDatColor label="Assests color" path="assetsColor" />
        </StyledDatFolder>
        <StyledButton label="Exit" onClick={(e) => close3DViewer()} />
      </StyledDatGui>
      <SelectedObjectInfoContainer>
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

export default DigitalTwin3DViewer;
