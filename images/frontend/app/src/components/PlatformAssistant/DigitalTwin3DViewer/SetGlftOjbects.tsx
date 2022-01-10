import { useGLTF } from '@react-three/drei';
import { FC, useEffect } from 'react'
import { IAnimatedObject, IAssetObject, IGenericObject, ISensorObject } from './Model';
import {
    AnimatedObjectState,
    AssetState,
    generateInitialAnimatedObjectsState,
    generateInitialAssetsState,
    generateInitialSensorsState,
    ObjectVisibilityState,
    IDigitalTwinGltfData,
    SensorState,
    sortObjects
} from './ViewerUtils';

interface SetGltfObjectsProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    setSensorObjects: (sensorObjects: ISensorObject[]) => void;
    setAssetObjects: (assetObjects: IAssetObject[]) => void;
    setAnimatedObjects: (animatedObjects: IAnimatedObject[]) => void;
    setGenericObjects: (genericObjects: IGenericObject[]) => void;
    setInitialSensorsState: (initialSensorsState: Record<string, SensorState> | null) => void;
    setInitialAssetsState: (initialAssetsState: Record<string, AssetState> | null) => void;
    setInitialAnimatedObjectsState: (initialAnimatedObjectsState: Record<string, AnimatedObjectState> | null) => void;
    setInitialGenericObjectsVisibilityState: (initialGenericObjectsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialSensorsVisibilityState: (initialSensorsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialAssetsVisibilityState: (initialAssetsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
    setInitialAnimatedObjsVisibilityState: (initialAnimatedObjsVisibilityState: Record<string, ObjectVisibilityState> | null) => void;
}


const SetGltfObjects: FC<SetGltfObjectsProps> = ({
    digitalTwinGltfData,
    setSensorObjects,
    setAssetObjects,
    setAnimatedObjects,
    setGenericObjects,
    setInitialSensorsState,
    setInitialAssetsState,
    setInitialAnimatedObjectsState,
    setInitialGenericObjectsVisibilityState,
    setInitialSensorsVisibilityState,
    setInitialAssetsVisibilityState,
    setInitialAnimatedObjsVisibilityState
}) => {
    const { nodes, materials, animations } = useGLTF(digitalTwinGltfData.digitalTwinGltfUrl as string) as any;

    useEffect(() => {
        if (nodes && materials) {
            const {
                sensorObjects,
                assetObjects,
                animatedObjects,
                genericObjects,
                sensorsCollectionNames,
                assetsCollectionNames,
                animatedObjectsCollectionNames,
                genericObjectsCollectionNames
            } = sortObjects(nodes, materials, animations);
            setSensorObjects(sensorObjects);
            setAssetObjects(assetObjects);
            setAnimatedObjects(animatedObjects);
            setGenericObjects(genericObjects);
            setInitialSensorsState(generateInitialSensorsState(sensorObjects, digitalTwinGltfData));
            setInitialAssetsState(generateInitialAssetsState(assetObjects, digitalTwinGltfData));
            setInitialAnimatedObjectsState(generateInitialAnimatedObjectsState(animatedObjects, digitalTwinGltfData))

            const initialGenericObjectsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of genericObjectsCollectionNames) {
                initialGenericObjectsVisibilityState[collectionName] = { hide: false, highlight: false, opacity: 1.0 };
            }
            setInitialGenericObjectsVisibilityState(initialGenericObjectsVisibilityState);


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

            const initialAnimatedObjsVisibilityState: Record<string, ObjectVisibilityState> = {}
            for (const collectionName of animatedObjectsCollectionNames) {
                initialAnimatedObjsVisibilityState[collectionName] = { hide: false, highlight: false, opacity: 1.0 };
            }
            setInitialAnimatedObjsVisibilityState(initialAnimatedObjsVisibilityState);
        }

        return () => URL.revokeObjectURL(digitalTwinGltfData.digitalTwinGltfUrl as string);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return null;

}

export default SetGltfObjects;