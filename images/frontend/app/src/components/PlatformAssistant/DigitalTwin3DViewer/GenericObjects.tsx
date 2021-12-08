import * as THREE from 'three'
import React, { FC, useRef } from 'react'

interface GenericObjectProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
}

const GenericObject: FC<GenericObjectProps> = ({ obj }) => {
    const meshRef = useRef<THREE.Mesh>()
    return (
        <mesh
            ref={meshRef}
            castShadow
            receiveShadow
            geometry={obj.geometry}
            material={obj.material}
            position={[obj.position.x, obj.position.y, obj.position.z]}
            rotation={[obj.rotation.x, obj.rotation.y, obj.rotation.z]}
            scale={[obj.scale.x, obj.scale.y, obj.scale.z]}
        />
    )
}

interface GenericObjectsProps {
	genericObjects: THREE.Mesh[];
}


const GenericObjects: FC<GenericObjectsProps> = ({
	genericObjects
}) => {
	return (
		<>
			{
				genericObjects.map((obj, index) => {
					return <GenericObject key={obj.uuid} obj={obj} />
				})
			}
		</>
	)
}


export default GenericObjects;