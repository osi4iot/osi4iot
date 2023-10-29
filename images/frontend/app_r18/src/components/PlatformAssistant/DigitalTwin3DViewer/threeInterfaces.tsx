export interface IThreeMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]> {
    blenderAnimationTypes: string[];
    customAnimationObjectNames: string[];
    onOffObjectNames: string[];
    quaternionIni: THREE.Quaternion;
}