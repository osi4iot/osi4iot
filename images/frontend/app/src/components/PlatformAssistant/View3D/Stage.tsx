import React, { useState, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

type ControlsProto = { update(): void; target: THREE.Vector3 }

type Props = JSX.IntrinsicElements['group'] & {
    shadows?: boolean
    intensity?: number
    ambientLigth?: boolean
    spotLigth?: boolean
    pointLight?: boolean
    ambience?: number
    controls?: React.MutableRefObject<ControlsProto>
    shadowBias?: number
}


export function Stage({
    children,
    controls,
    shadows = true,
    ambientLigth = true,
    spotLigth = true,
    pointLight = true,
    intensity = 1.0,
    shadowBias = 0,
    ...props
}: Props) {
    const camera = useThree((state) => state.camera);
    const sceneWidth = useThree((state) => state.size.width);
    const sceneHeigth = useThree((state) => state.size.height);
    // @ts-expect-error new in @react-three/fiber@7.0.5
    const defaultControls = useThree((state) => state.controls) as ControlsProto
    const childrenGroup = React.useRef<THREE.Group>(null!)
    const [{ radius, width, height, deep }, set] = useState({ radius: 0, width: 0, height: 0, deep: 0 })

    useLayoutEffect(() => {
        const box3 = new THREE.Box3().setFromObject(childrenGroup.current);
        const center = new THREE.Vector3();
        const sphere = new THREE.Sphere();
        const width = box3.max.x - box3.min.x;
        const height = box3.max.y - box3.min.y;
        const deep = box3.max.z - box3.min.z;
        box3.getCenter(center);
        box3.getBoundingSphere(sphere);
        set({ radius: sphere.radius, width, height, deep });

        const zoom_fact_x = 0.7 * Math.min(sceneWidth, sceneHeigth) / width;
        const zoom_fact_y = 0.7 * Math.min(sceneWidth, sceneHeigth) / height;
        const zoom_fact_z = 1.5 * Math.min(sceneWidth, sceneHeigth) / deep;
        const zoom_fact = Math.min(zoom_fact_x, zoom_fact_y, zoom_fact_z);
        camera.zoom = zoom_fact;
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sceneWidth, sceneHeigth])


    useLayoutEffect(() => {
        let y = radius / (Math.max(height, deep) > width ? 20.0 : 10.0);
        camera.position.set(radius * 1.0, radius * 1.0, radius * 2.5);
        camera.near = 0.1;
        camera.far = Math.max(5000, radius * 4);
        camera.lookAt(0, -y, 0);
        const ctrl = defaultControls || controls?.current;
        if (ctrl) {
            ctrl.target.set(0, -y, 0);
            ctrl.update();
        }
        camera.updateProjectionMatrix();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultControls, radius, height, width])

    return (
        <group {...props}>
            <group ref={childrenGroup}>{children}</group>
            {ambientLigth && <ambientLight intensity={intensity / 3} />}
            {spotLigth &&
                <spotLight
                    penumbra={1.0}
                    position={[1.0 * radius, 2.0 * radius, 0.9 * radius]}
                    intensity={intensity * 2}
                    castShadow={shadows}
                    shadow-bias={shadowBias}
                />}
            {pointLight &&
                <pointLight
                    position={[-2.0 * radius, -0.5 * radius, -1.8 * radius]}
                    intensity={intensity * 1}
                />
            }

        </group>
    )
}