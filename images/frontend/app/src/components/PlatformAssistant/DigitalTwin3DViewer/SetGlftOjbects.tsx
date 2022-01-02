import { useGLTF } from '@react-three/drei';
import { FC, useEffect } from 'react'
import { IAnimatedObject, IAssetObject, ISensorObject } from './Model';
import {
    AnimatedObjectState,
    AssetState,
    generateInitialAnimatedObjectsState,
    generateInitialAssetsState,
    generateInitialSensorsState,
    IDigitalTwinGltfData,
    SensorState,
    sortObjects
} from './ViewerUtils';

interface SetGltfObjectsProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    setSensorObjects: (sensorObjects: ISensorObject[]) => void;
    setAssetObjects: (assetObjects: IAssetObject[]) => void;
    setAnimatedObjects: (animatedObjects: IAnimatedObject[]) => void;
    setGenericObjects: (genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[]) => void;
    setInitialSensorsState: (initialSensorsState: Record<string, SensorState> | null) => void;
    setInitialAssetsState: (initialAssetsState: Record<string, AssetState> | null) => void;
    setInitialAnimatedObjectsState: (initialAnimatedObjectsState: Record<string, AnimatedObjectState> | null) => void;
}


const SetGltfObjects: FC<SetGltfObjectsProps> = ({
    digitalTwinGltfData,
    setSensorObjects,
    setAssetObjects,
    setAnimatedObjects,
    setGenericObjects,
    setInitialSensorsState,
    setInitialAssetsState,
    setInitialAnimatedObjectsState
}) => {
    const { nodes, materials, animations } = useGLTF(digitalTwinGltfData.digitalTwinGltfUrl as string) as any;

    useEffect(() => {
        if (nodes && materials) {
            const {
                sensorObjects,
                assetObjects,
                genericObjects,
                animatedObjects,
            } = sortObjects(nodes, materials, animations);
            setSensorObjects(sensorObjects);
            setAssetObjects(assetObjects);
            setAnimatedObjects(animatedObjects);
            setGenericObjects(genericObjects);
            setInitialSensorsState(generateInitialSensorsState(sensorObjects, digitalTwinGltfData));
            setInitialAssetsState(generateInitialAssetsState(assetObjects, digitalTwinGltfData));
            setInitialAnimatedObjectsState(generateInitialAnimatedObjectsState(animatedObjects, digitalTwinGltfData))
        }

        return () => URL.revokeObjectURL(digitalTwinGltfData.digitalTwinGltfUrl as string);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return null;

}

export default SetGltfObjects;