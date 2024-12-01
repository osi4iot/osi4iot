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
} from './ViewerUtils';


interface SetGltfObjectsProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    setSensorObjects: (sensorObjects: ISensorObject[]) => void;
    setSensorCollectionNames: (sensorCollectionNames: string[]) => void;
    setAssetObjects: (assetObjects: IAssetObject[]) => void;
    setAssetCollectionNames: (assetCollectionNames: string[]) => void;
    setGenericObjects: (genericObjects: IGenericObject[]) => void;
    setGenericObjectCollectionNames: (genericObjectCollectionNames: string[]) => void;
    setFemSimulationObjects: (femSimulationObjects: IFemSimulationObject[]) => void;
    setFemSimObjectCollectionNames: (femSimObjectCollectionNames: string[]) => void;
    setInitialSensorsState: (initialSensorsState: Record<string, SensorState> | null) => void;
    setInitialAssetsState: (initialAssetsState: Record<string, AssetState> | null) => void;
    setInitialGenericObjectsState: (initialGenericObjectsState: Record<string, GenericObjectState> | null) => void;
    setInitialGenericObjectsVisibilityState: (initialGenericObjectsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialSensorsVisibilityState: (initialSensorsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialAssetsVisibilityState: (initialAssetsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialFemSimObjectsVisibilityState: (initialFemSimObjectsVisibilityState: Record<string, FemSimObjectVisibilityState> | null) => void;
    setInitialDigitalTwinSimulatorState: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}


const SetGltfObjects: FC<SetGltfObjectsProps> = ({
    digitalTwinGltfData,
    setSensorObjects,
    setSensorCollectionNames,
    setAssetObjects,
    setAssetCollectionNames,
    setGenericObjects,
    setGenericObjectCollectionNames,
    setFemSimulationObjects,
    setFemSimObjectCollectionNames,
    setInitialSensorsState,
    setInitialAssetsState,
    setInitialGenericObjectsState,
    setInitialGenericObjectsVisibilityState,
    setInitialSensorsVisibilityState,
    setInitialAssetsVisibilityState,
    setInitialFemSimObjectsVisibilityState,
    setInitialDigitalTwinSimulatorState
}) => {
    //const { nodes, materials, animations } = useGLTF(digitalTwinGltfData.digitalTwinGltfUrl as string) as any;

    useEffect(() => {
        const nodes =digitalTwinGltfData.gltfFile.nodes;
        const materials = digitalTwinGltfData.gltfFile.materials;
        const animations = digitalTwinGltfData.gltfFile.animations;
        if (nodes && materials) {
            const {
                sensorObjects,
                assetObjects,
                genericObjects,
                femSimulationObjects,
                sensorsCollectionNames,
                assetsCollectionNames,
                genericObjectsCollectionNames,
                femSimObjectCollectionNames
            } = sortObjects(nodes, materials, animations);
            setSensorObjects(sensorObjects);
            setSensorCollectionNames(sensorsCollectionNames);
            setAssetObjects(assetObjects);
            setAssetCollectionNames(assetsCollectionNames);
            setGenericObjects(genericObjects);
            setGenericObjectCollectionNames(genericObjectsCollectionNames);
            setFemSimulationObjects(femSimulationObjects);
            setFemSimObjectCollectionNames(femSimObjectCollectionNames);
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
                initialGenericObjectsVisibilityState[collectionName] = {
                    hide: false,
                    highlight: false,
                    opacity: 1.0,
                    showDeepObjects: false
                };
            }
            setInitialGenericObjectsVisibilityState(initialGenericObjectsVisibilityState);;

            const initialSensorsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of sensorsCollectionNames) {
                initialSensorsVisibilityState[collectionName] = {
                    hide: false,
                    highlight: false,
                    showSensorMarker: false,
                    opacity: 1.0
                };
            }
            setInitialSensorsVisibilityState(initialSensorsVisibilityState);

            const initialAssetsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of assetsCollectionNames) {
                initialAssetsVisibilityState[collectionName] = {
                    hide: false,
                    highlight: false,
                    opacity: 1.0
                };
            }
            setInitialAssetsVisibilityState(initialAssetsVisibilityState);

            const initialFemSimObjectsVisibilityState: Record<string, FemSimObjectVisibilityState> = {}
            for (const collectionName of femSimObjectCollectionNames) {
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

        return () => {
            useGLTF.clear(digitalTwinGltfData.digitalTwinGltfUrl as string);
            URL.revokeObjectURL(digitalTwinGltfData.digitalTwinGltfUrl as string);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return null;
}

export default SetGltfObjects;