import { useGLTF } from '@react-three/drei';
import { FC, useEffect } from 'react'
import {
    IAssetObject,
    IFemSimulationObject,
    IGenericObject,
    ISensorObject
} from './Model';
import {
    AssetState,
    generateInitialAssetsState,
    generateInitialSensorsState,
    ObjectVisibilityState,
    IDigitalTwinGltfData,
    SensorState,
    sortObjects,
    GenericObjectState,
    generateInitialGenericObjectsState,
    FemSimObjectVisibilityState,
    FemSimulationObjectState,
} from './ViewerUtils';

interface SetGltfObjectsProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    femResultData: any;
    setSensorObjects: (sensorObjects: ISensorObject[]) => void;
    setAssetObjects: (assetObjects: IAssetObject[]) => void;
    setGenericObjects: (genericObjects: IGenericObject[]) => void;
    setFemSimulationObjects: (femSimulationObjects: IFemSimulationObject[]) => void;
    setInitialSensorsState: (initialSensorsState: Record<string, SensorState> | null) => void;
    setInitialAssetsState: (initialAssetsState: Record<string, AssetState> | null) => void;
    setInitialGenericObjectsState: (initialGenericObjectsState: Record<string, GenericObjectState> | null) => void;
    setInitialFemSimObjectsState: (initialFemSimObjectsState: FemSimulationObjectState[]) => void;
    setInitialGenericObjectsVisibilityState: (initialGenericObjectsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialSensorsVisibilityState: (initialSensorsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialAssetsVisibilityState: (initialAssetsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialFemSimObjectsVisibilityState: (initialFemSimObjectsVisibilityState: Record<string, FemSimObjectVisibilityState> | null) => void;
    setInitialDigitalTwinSimulatorState: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}


const SetGltfObjects: FC<SetGltfObjectsProps> = ({
    digitalTwinGltfData,
    femResultData,
    setSensorObjects,
    setAssetObjects,
    setGenericObjects,
    setFemSimulationObjects,
    setInitialSensorsState,
    setInitialAssetsState,
    setInitialGenericObjectsState,
    setInitialFemSimObjectsState,
    setInitialGenericObjectsVisibilityState,
    setInitialSensorsVisibilityState,
    setInitialAssetsVisibilityState,
    setInitialFemSimObjectsVisibilityState,
    setInitialDigitalTwinSimulatorState
}) => {
    const { nodes, materials, animations } = useGLTF(digitalTwinGltfData.digitalTwinGltfUrl as string) as any;

    useEffect(() => {
        if (nodes && materials) {
            const {
                sensorObjects,
                assetObjects,
                genericObjects,
                femSimulationObjects,
                sensorsCollectionNames,
                assetsCollectionNames,
                genericObjectsCollectionNames,
                femSimulationObjectsCollectionNames
            } = sortObjects(nodes, materials, animations);
            setSensorObjects(sensorObjects);
            setAssetObjects(assetObjects);
            setGenericObjects(genericObjects);
            setFemSimulationObjects(femSimulationObjects);
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

            const digitalTwinSimulationFormat = digitalTwinGltfData.digitalTwinSimulationFormat;
            if (Object.keys(digitalTwinSimulationFormat).length !== 0) {
                const initialDigitalTwinSimulatorState: Record<string, number> = {};
                Object.keys(digitalTwinSimulationFormat).forEach(fieldName => {
                    initialDigitalTwinSimulatorState[fieldName] = digitalTwinSimulationFormat[fieldName].defaultValue;
                });
                setInitialDigitalTwinSimulatorState(initialDigitalTwinSimulatorState);
            }

            const initialGenericObjectsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of genericObjectsCollectionNames) {
                initialGenericObjectsVisibilityState[collectionName] = { hide: false, highlight: false, opacity: 1.0 };
            }
            setInitialGenericObjectsVisibilityState(initialGenericObjectsVisibilityState);;

            const initialSensorsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of sensorsCollectionNames) {
                initialSensorsVisibilityState[collectionName] = { hide: false, highlight: false, opacity: 1.0 };
            }
            setInitialSensorsVisibilityState(initialSensorsVisibilityState);

            const initialAssetsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of assetsCollectionNames) {
                initialAssetsVisibilityState[collectionName] = { hide: false, highlight: false, opacity: 1.0 };
            }
            setInitialAssetsVisibilityState(initialAssetsVisibilityState);

            const initialFemSimObjectsVisibilityState: Record<string, FemSimObjectVisibilityState> = {}
            for (const collectionName of femSimulationObjectsCollectionNames) {
                initialFemSimObjectsVisibilityState[collectionName] = {
                    hide: false,
                    showMesh: false,
                    showDeformation: false,
                    highlight: false,
                    opacity: 1.0,
                    femSimulationResult: "None result",
                };
            }
            setInitialFemSimObjectsVisibilityState(initialFemSimObjectsVisibilityState);
        }

        return () => URL.revokeObjectURL(digitalTwinGltfData.digitalTwinGltfUrl as string);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return null;
}

export default SetGltfObjects;