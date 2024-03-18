
export const fileSystemRoot = async () => {
    const opfsRoot = await (navigator.storage as any).getDirectory();
    return opfsRoot;
}

export const getDtRootFolder = async () => {
    const opfsRoot = await (navigator.storage as any).getDirectory();
    const directoryHandle = await opfsRoot
        .getDirectoryHandle('digital_twin', { create: true });
    return directoryHandle;
}

export const writeGltfFile = async (digitalTwinUid: string, gltfData: any) => {
    const dtRootFolder = await getDtRootFolder();
    const dtFolderName = `dt_${digitalTwinUid}`;
    const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName, { create: true });
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile', { create: true });

    const glftFileHandler = await gltfFolderHandler
        .getFileHandle('digital_twin_data.txt', { create: true });

    const writable = await glftFileHandler.createWritable();
    await writable.write(JSON.stringify(gltfData));
    await writable.close();

}

export const readGltfFile = async (digitalTwinUid: string,) => {
    const dtRootFolder = await getDtRootFolder();
    const dtFolderName = `dt_${digitalTwinUid}`;
    const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName, { create: true });
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile', { create: true });
    const glftFileHandler = await gltfFolderHandler.getFileHandle('digital_twin_data.txt');
    const file = await glftFileHandler.getFile();
    const text = await file.text();
    return JSON.parse(text);
}

export const getFemResFileHandler = async (dtRootFolder: any, digitalTwinUid: string) => {
    const dtFolderName = `dt_${digitalTwinUid}`;
    const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName, { create: true });
    const gltfFolder = await dtFolder.getDirectoryHandle('gltfFile', { create: true });
    const femResFolder = await dtFolder.getDirectoryHandle('femResFiles', { create: true });
    return [gltfFolder, femResFolder];
}

export const storeGltfData = async (
    digitalTwinUid: string,
    sensorObjects: any,
    assetObjects: any,
    genericObjects: any,
    femSimulationObjects: any,
    sensorsCollectionNames: any,
    assetsCollectionNames: any,
    genericObjectsCollectionNames: any,
    femSimObjectCollectionNames: any
) => {
    const dtRootFolder = await getDtRootFolder();
    const dtFolderName = `dt_${digitalTwinUid}`;
    const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName, { create: true });
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile', { create: true });


    const glftFileHandler = await gltfFolderHandler
        .getFileHandle('digital_twin_data.txt', { create: true });

    const gltfData = {
        sensorObjects,
        assetObjects,
        genericObjects,
        femSimulationObjects,
        sensorsCollectionNames,
        assetsCollectionNames,
        genericObjectsCollectionNames,
        femSimObjectCollectionNames
    };
    const writable = await glftFileHandler.createWritable();
    await writable.write(JSON.stringify(gltfData));
    await writable.close();
}

export const readGltfData = async (digitalTwinUid: string) => {
    const dtRootFolder = await getDtRootFolder();
    const dtFolderName = `dt_${digitalTwinUid}`;
    const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName, { create: true });
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile', { create: true });
    const glftFileHandler = await gltfFolderHandler.getFileHandle('digital_twin_data.txt');
    const file = await glftFileHandler.getFile();
    const text = await file.text();
    return JSON.parse(text);
}