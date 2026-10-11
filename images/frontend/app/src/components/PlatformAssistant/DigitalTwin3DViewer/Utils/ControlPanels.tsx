// ControlPanels.tsx
import { FC } from "react";
import { DatFolder } from "react-dat-gui";

import { ViewerOptions } from "../Types/types";
import { ENVIRONMENT_OPTIONS } from "./constants";
import {
    StyledDataGui,
    StyledDatBoolean,
    StyledDatNumber,
    StyledDatNumberDTSimulator,
    StyledDatSelect,
    StyledDatButtom,
} from "./StyledComponents";

interface ControlPanelProps {
    opts: ViewerOptions;
    setOpts: (updater: (prevOpts: ViewerOptions) => ViewerOptions) => void;
    sensorObjects: any[];
    sensorCollectionNames: string[];
    assetObjects: any[];
    assetCollectionNames: string[];
    genericObjects: any[];
    genericObjectCollectionNames: string[];
    femSimulationObjects: any[];
    femSimObjectCollectionNames: string[];
    femResultDates: string[];
    femResultNames: string[];
    digitalTwinSimulationFormat: Record<string, any>;
    getLastMeasurementsButtomLabel: string;
    lockReadingButtomLabel: string;
    handleGetLastMeasurementsButton: () => void;
    handleLockReadMeasurementsButtonClick: () => void;
    datGuiStyle: any;
}

export const ControlPanel: FC<ControlPanelProps> = ({
    opts,
    setOpts,
    sensorObjects,
    sensorCollectionNames,
    assetObjects,
    assetCollectionNames,
    genericObjects,
    genericObjectCollectionNames,
    femSimulationObjects,
    femSimObjectCollectionNames,
    femResultDates,
    femResultNames,
    digitalTwinSimulationFormat,
    getLastMeasurementsButtomLabel,
    lockReadingButtomLabel,
    handleGetLastMeasurementsButton,
    handleLockReadMeasurementsButtonClick,
    datGuiStyle,
}) => {
    // Handler function to properly update the options
    const handleUpdate = (newOpts: ViewerOptions) => {
        setOpts(() => newOpts);
    };

    return (
        <StyledDataGui data={opts} onUpdate={handleUpdate} style={datGuiStyle}>
            <DatFolder title="Lights" closed={true}>
                <DatFolder title="Environment" closed={true}>
                    <StyledDatSelect path="environment" label="Select: " options={ENVIRONMENT_OPTIONS} />
                </DatFolder>
                <DatFolder title="Ambient light" closed={true}>
                    <StyledDatNumber label="Intensity" path="ambientLightIntensity" min={0} max={10} step={0.05} />
                    <StyledDatBoolean label="Switch on/off" path="ambientLigth" />
                </DatFolder>
                <DatFolder title="Spot light" closed={true}>
                    <StyledDatNumber label="Power (lm)" path="spotLightPower" min={0} max={5000} step={5} />
                    <StyledDatBoolean label="Switch on/off" path="spotLight" />
                    <StyledDatBoolean label="Show helper" path="showSpotLightHelper" />
                </DatFolder>
                <DatFolder title="Point light" closed={true}>
                    <StyledDatNumber label="Power (lm)" path="pointLightPower" min={0} max={5000} step={10} />
                    <StyledDatBoolean label="Switch on/off" path="pointLight" />
                    <StyledDatBoolean label="Show helper" path="showPointLightHelper" />
                </DatFolder>
                <DatFolder title="Shadows" closed={true}>
                    <StyledDatBoolean label="Show shadows" path="showShadows" />
                </DatFolder>
            </DatFolder>

            <DatFolder title="Axes" closed={true}>
                <StyledDatBoolean label="Show" path="showAxes" />
            </DatFolder>

            <DatFolder title="Web workers preferences" closed={true}>
                <StyledDatBoolean label="Switch on/off" path="enableWebWorkes" />
                <StyledDatNumber
                    label="Num workers"
                    path="numWebWorkers"
                    min={1}
                    max={window.navigator.hardwareConcurrency || 1}
                    step={1}
                />
                <StyledDatBoolean label="Log time" path="logElapsedTime" />
            </DatFolder>

            {sensorObjects.length !== 0 && (
                <DatFolder title="Sensors" closed={true}>
                    <DatFolder
                        title={sensorCollectionNames.length > 1 ? "All nodes" : sensorCollectionNames[0]}
                        closed={true}
                    >
                        <StyledDatNumber label="Opacity" path="sensorsOpacity" min={0} max={1} step={0.05} />
                        <StyledDatBoolean label="Highlight" path="highlightAllSensors" />
                        <StyledDatBoolean label="Sensor marker" path="showAllSensorsMarker" />
                        <StyledDatBoolean label="Hide" path="hideAllSensors" />
                    </DatFolder>
                    {(sensorCollectionNames.length > 1 ? sensorCollectionNames : []).map((collecionName) => (
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
                            <StyledDatBoolean label="Hide" path={`sensorsVisibilityState[${collecionName}].hide`} />
                        </DatFolder>
                    ))}
                </DatFolder>
            )}

            {assetObjects.length !== 0 && (
                <DatFolder title="Assests" closed={true}>
                    <DatFolder
                        title={assetCollectionNames.length > 1 ? "All nodes" : assetCollectionNames[0]}
                        closed={true}
                    >
                        <StyledDatNumber label="Opacity" path="assetsOpacity" min={0} max={1} step={0.05} />
                        <StyledDatBoolean label="Highlight" path="highlightAllAssets" />
                        <StyledDatBoolean label="Hide" path="hideAllAssets" />
                    </DatFolder>
                    {(assetCollectionNames.length > 1 ? assetCollectionNames : []).map((collecionName) => (
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
                            <StyledDatBoolean label="Hide" path={`assetsVisibilityState[${collecionName}].hide`} />
                        </DatFolder>
                    ))}
                </DatFolder>
            )}

            {genericObjects.length !== 0 && (
                <DatFolder title="Generic objects" closed={true}>
                    <DatFolder
                        title={genericObjectCollectionNames.length > 1 ? "All nodes" : genericObjectCollectionNames[0]}
                        closed={true}
                    >
                        <StyledDatNumber label="Opacity" path="genericObjectsOpacity" min={0} max={1} step={0.05} />
                        <StyledDatBoolean label="Show deep obj" path="genericObjectsShowDeepObjects" />
                        <StyledDatBoolean label="Highlight" path="highlightAllGenericObjects" />
                        <StyledDatBoolean label="Hide" path="hideAllGenericObjects" />
                    </DatFolder>
                    {(genericObjectCollectionNames.length > 1 ? genericObjectCollectionNames : []).map(
                        (collecionName) => (
                            <DatFolder key={collecionName} title={collecionName} closed={true}>
                                <StyledDatNumber
                                    label="Opacity"
                                    path={`genericObjectsVisibilityState[${collecionName}].opacity`}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                />
                                <StyledDatBoolean
                                    label="Show deep obj"
                                    path={`genericObjectsVisibilityState[${collecionName}].showDeepObjects`}
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
                    )}
                </DatFolder>
            )}

            {femSimulationObjects.length !== 0 && (
                <DatFolder title="Fem objects" closed={true}>
                    <DatFolder
                        title={femSimObjectCollectionNames.length > 1 ? "All nodes" : femSimObjectCollectionNames[0]}
                        closed={true}
                    >
                        <StyledDatSelect path="femResultDate" label="Date" options={femResultDates} />
                        <StyledDatSelect
                            path="femSimulationResult"
                            label="Results"
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
                        <StyledDatNumber
                            label="Opacity"
                            path="femSimulationObjectsOpacity"
                            min={0}
                            max={1}
                            step={0.05}
                        />
                        <StyledDatBoolean label="Highlight" path="highlightAllFemSimulationObjects" />
                        <StyledDatBoolean label="Hide objects" path="hideAllFemSimulationObjects" />
                        <StyledDatSelect
                            path="legendToShow"
                            label="Legend"
                            options={["None result", ...femResultNames]}
                        />
                        <StyledDatBoolean label="Hide legend" path="hideFemSimulationLegend" />
                    </DatFolder>

                    
                    {(femSimObjectCollectionNames.length > 1 ? femSimObjectCollectionNames : []).map(
                        (collecionName) => (
                            <DatFolder key={collecionName} title={collecionName} closed={true}>
                                <StyledDatSelect
                                    path={`femSimulationObjectsVisibilityState[${collecionName}].femSimulationResult`}
                                    label="Results"
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
                    )}
                </DatFolder>
            )}

            {Object.keys(digitalTwinSimulationFormat).length !== 0 && (
                <DatFolder title="Digital twin simulator" closed={true}>
                    {Object.keys(digitalTwinSimulationFormat).map((paramName) => {
                        let label = paramName;
                        const dtsLabel = digitalTwinSimulationFormat[paramName].label;
                        const dtsUnits = digitalTwinSimulationFormat[paramName].units;
                        if (dtsLabel !== undefined && dtsUnits !== undefined) {
                            label = `${dtsLabel} (${dtsUnits}) :`;
                        }
                        return (
                            <StyledDatNumberDTSimulator
                                key={label}
                                label={label}
                                path={`digitalTwinSimulatorState[${paramName}]`}
                                min={digitalTwinSimulationFormat[paramName].minValue}
                                max={digitalTwinSimulationFormat[paramName].maxValue}
                                step={digitalTwinSimulationFormat[paramName].step}
                            />
                        );
                    })}
                    <StyledDatButtom label={getLastMeasurementsButtomLabel} onClick={handleGetLastMeasurementsButton} />
                    <StyledDatButtom label={lockReadingButtomLabel} onClick={handleLockReadMeasurementsButtonClick} />
                </DatFolder>
            )}
        </StyledDataGui>
    );
};