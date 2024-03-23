import { IDigitalTwin } from "../components/PlatformAssistant/TableColumns/digitalTwinsColumns";

const existFolderOrFile = async (interator: any, folderOrFileName: string) => {
    let exists = false;
    for await (let name of interator) {
        if (name === folderOrFileName) {
            exists = true;
            break;
        }
    }
    return exists;
}

export const fileSystemRoot = async () => {
    const opfsRoot = await (navigator.storage as any).getDirectory();
    return opfsRoot;
}

export const getDtRootFolder = async () => {
    const opfsRoot = await fileSystemRoot();
    const dtRootFolder = await opfsRoot
        .getDirectoryHandle('digital_twin', { create: true });
    return dtRootFolder;
}

export const getDTFolder = async (digitalTwinUid: string) => {
    const dtRootFolder = await getDtRootFolder();
    const dtFolderName = `dt_${digitalTwinUid}`;
    const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName, { create: true });
    return dtFolder;
}


export const writeGltfData = async (
    digitalTwinUid: string,
    gltfData: any,
    gltfFileName: string,
    glttFileDate: string
) => {
    const dtFolder = await getDTFolder(digitalTwinUid);
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile', { create: true });
    const glftFileHandler = await gltfFolderHandler
        .getFileHandle('digital_twin_data.txt', { create: true });

    const gltfMetadataHandler = await gltfFolderHandler
        .getFileHandle('metadata.txt', { create: true });
    const gltfMetadata = {
        fileName: gltfFileName,
        fileDate: glttFileDate
    };
    const writableMetadata = await gltfMetadataHandler.createWritable();
    await writableMetadata.write(JSON.stringify(gltfMetadata));
    await writableMetadata.close();

    const writable = await glftFileHandler.createWritable();
    await writable.write(JSON.stringify(gltfData));
    await writable.close();
}

export const existsDTRootFolderFun = async () => {
    const opfsRoot = await (navigator.storage as any).getDirectory();
    const existDTRootFolder = await existFolderOrFile(opfsRoot.keys(), 'digital_twin');
    if (!existDTRootFolder) return false;
    return true;
}

export const existsDTFolderFun = async (
    digitalTwinUid: string,
) => {
    const opfsRoot = await (navigator.storage as any).getDirectory();
    const existDTRootFolder = await existFolderOrFile(opfsRoot.keys(), 'digital_twin');
    if (!existDTRootFolder) return false;
    const dtRootFolder = await opfsRoot.getDirectoryHandle('digital_twin');
    const dtFolderName = `dt_${digitalTwinUid}`;
    const existDTFolder = await existFolderOrFile(dtRootFolder.keys(), dtFolderName);
    if (!existDTFolder) return false;
    return true;
}

export const existGltfDataLocallyStored = async (
    digitalTwinUid: string,
    gltfFileName: string,
    glttFileDate: string
) => {
    const existDTFolder = await existsDTFolderFun(digitalTwinUid);
    if (!existDTFolder) return false;
    const dtFolder = await getDTFolder(digitalTwinUid);
    const existGltfFolder = await existFolderOrFile(dtFolder.keys(), 'gltfFile');
    if (!existGltfFolder) return false;
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile');
    const existDTFile = await existFolderOrFile(gltfFolderHandler.keys(), 'digital_twin_data.txt');
    if (!existDTFile) return false;

    const existMetadataFile = await existFolderOrFile(gltfFolderHandler.keys(), 'metadata.txt');
    if (existMetadataFile) {
        const gltfMetadataHandler = await gltfFolderHandler.getFileHandle('metadata.txt', { create: true });
        const metadataFile = await gltfMetadataHandler.getFile();
        const metadataText = await metadataFile.text();
        if (metadataText !== "") {
            const metadata = JSON.parse(metadataText) as IResFileMetadata;
            if (metadata.fileName !== gltfFileName || metadata.fileDate !== glttFileDate) {
                await gltfFolderHandler.removeEntry('digital_twin_data.txt');
                await gltfFolderHandler.removeEntry('metadata.txt');
                return false;
            }
        }
    }

    return true;
}

export const readGltfData = async (digitalTwinUid: string) => {
    const dtFolder = await getDTFolder(digitalTwinUid);
    const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile', { create: true });
    const glftFileHandler = await gltfFolderHandler.getFileHandle('digital_twin_data.txt');
    const file = await glftFileHandler.getFile();
    const text = await file.text();
    return JSON.parse(text);
}

export const existFemResFileLocallyStored = async (
    digitalTwinUid: string,
    fileName: string,
    femResultDates: string[],
    femResultFileNames: string[],
) => {
    const existDTFolder = await existsDTFolderFun(digitalTwinUid);
    if (!existDTFolder) return false;
    const dtFolder = await getDTFolder(digitalTwinUid);
    const existFemResFilesFolder = await existFolderOrFile(dtFolder.keys(), 'femResFiles');
    if (!existFemResFilesFolder) return false;
    const femResFilesFolderHandler = await dtFolder.getDirectoryHandle('femResFiles');
    const existFemResFile = await existFolderOrFile(femResFilesFolderHandler.keys(), fileName);
    if (!existFemResFile) return false;

    const existMetadataFile = await existFolderOrFile(femResFilesFolderHandler.keys(), 'metadata.txt');
    if (existMetadataFile) {
        const femResMetadataHandler = await femResFilesFolderHandler.getFileHandle('metadata.txt');
        const metadataFile = await femResMetadataHandler.getFile();
        const metadataText = await metadataFile.text();
        let metadata: IResFileMetadata[] = [];
        if (metadataText !== "") {
            metadata = JSON.parse(metadataText) as IResFileMetadata[];
        }
        const metadataToRemove = metadata.filter((item: IResFileMetadata) => {
            const indexName = femResultFileNames.indexOf(item.fileName);
            if (indexName !== -1) {
                if (femResultDates[indexName] !== item.fileDate) return true;
                else return false;
            } else return true;
        });

        if (metadataToRemove.length !== 0) {
            const removeQueries = [];
            const fileNamesToRemove: string[] = []
            for (const metadataItem of metadataToRemove) {
                const query = femResFilesFolderHandler.removeEntry(metadataItem.fileName);
                removeQueries.push(query);
                fileNamesToRemove.push(metadataItem.fileName);
            }
            await Promise.all(removeQueries);

            const filteredMetadata = metadata.filter((item: IResFileMetadata) =>
                !fileNamesToRemove.includes(item.fileName)
            );
            const writableMetadata = await femResMetadataHandler.createWritable();
            await writableMetadata.write(JSON.stringify(filteredMetadata));
            await writableMetadata.close();

            const removeCurrentResFile = metadataToRemove.filter((item: IResFileMetadata) =>
                item.fileName === fileName
            ).length !== 0;
            if (removeCurrentResFile) return false;
        }
    }

    return true;
}

interface IResFileMetadata {
    fileName: string,
    fileDate: string
}

export const writeFemResFile = async (
    digitalTwinUid: string,
    femResFileName: string,
    femResData: any,
    femResultDate: string
) => {
    const dtFolder = await getDTFolder(digitalTwinUid);
    const femResFilesFolderHandler = await dtFolder.getDirectoryHandle('femResFiles', { create: true });
    const femResFileHandler = await femResFilesFolderHandler
        .getFileHandle(femResFileName, { create: true });

    const femResMetadataHandler = await femResFilesFolderHandler
        .getFileHandle('metadata.txt', { create: true });
    const metadataFile = await femResMetadataHandler.getFile();
    const metadataText = await metadataFile.text();
    let metadata: IResFileMetadata[] = [];
    if (metadataText !== "") {
        metadata = JSON.parse(metadataText) as IResFileMetadata[];
    }
    const filteredMetadata = metadata.filter((item: { fileName: string, fileDate: string }) =>
        item.fileName === femResFileName && item.fileDate === femResultDate
    );
    if (filteredMetadata.length === 0) {
        const newResFileMetadata = {
            fileName: femResFileName,
            fileDate: femResultDate
        };
        metadata.push(newResFileMetadata);
        const writableMetadata = await femResMetadataHandler.createWritable();
        await writableMetadata.write(JSON.stringify(metadata));
        await writableMetadata.close();
    }

    const writable = await femResFileHandler.createWritable();
    await writable.write(JSON.stringify(femResData));
    await writable.close();
}

export const readFemResFile = async (digitalTwinUid: string, femResFileName: String) => {
    const dtFolder = await getDTFolder(digitalTwinUid);
    const femResFilesFolderHandler = await dtFolder.getDirectoryHandle('femResFiles', { create: true });
    const femResFileHandler = await femResFilesFolderHandler
        .getFileHandle(femResFileName, { create: true });
    const file = await femResFileHandler.getFile();
    const text = await file.text();
    return JSON.parse(text);
}

export const removeDTStoragebyUid = async (digitalTwinUid: string) => {
    const dtFolder = await getDTFolder(digitalTwinUid);
    await dtFolder.remove({ recursive: true });
    return "Current DT locally stored data succefully removed"
}

export const removeAllDTStorage = async () => {
    const dtRootFolder = await getDtRootFolder();
    await dtRootFolder.remove({ recursive: true });
    return "All DT locally stored data succefully removed"
}

export const syncDigitalTwinsLocalStorage = async (digitalTwins: IDigitalTwin[]) => {
    if (digitalTwins.length === 0) return;
    const digitalTwinUidArray = digitalTwins.map(dt => dt.digitalTwinUid);
    const existsDTRootFolder = await existsDTRootFolderFun();
    if (existsDTRootFolder) {
        const dtRootFolder = await getDtRootFolder();
        const removeFolderQueries = [];
        for await (let dtFolderName of dtRootFolder.keys()) {
            const digitalTwinUid = dtFolderName.split("_")[1];
            if (digitalTwinUidArray.indexOf(digitalTwinUid) === -1) {
                const query = removeDTStoragebyUid(dtFolderName);
                removeFolderQueries.push(query);
            }
        }
        if (removeFolderQueries.length !== 0) {
            await Promise.all(removeFolderQueries);
        }
    }
}

interface IDTStorageInfo {
    digitalTwinUid: string;
    numGltfFiles: number,
    numFemResFiles: number
}

export const getDTStorageInfo = async () => {
    const dtStorageInfo: IDTStorageInfo[] = [];
    const existsDTRootFolder = await existsDTRootFolderFun();
    if (existsDTRootFolder) {
        const dtRootFolder = await getDtRootFolder();
        for await (let dtFolderName of dtRootFolder.keys()) {
            const dtFolder = await dtRootFolder.getDirectoryHandle(dtFolderName);
            const digitalTwinUid = dtFolderName.split("_")[1];
            const item: IDTStorageInfo = {
                digitalTwinUid,
                numGltfFiles: 0,
                numFemResFiles: 0
            };

            const existGltfFolder = await existFolderOrFile(dtFolder.keys(), 'gltfFile');
            if (existGltfFolder) {
                const gltfFolderHandler = await dtFolder.getDirectoryHandle('gltfFile');
                const existDTFile = await existFolderOrFile(gltfFolderHandler.keys(), 'digital_twin_data.txt');
                if (existDTFile) {
                    item.numGltfFiles = 1;
                }
            }

            const existFemResFilesFolder = await existFolderOrFile(dtFolder.keys(), 'femResFiles');
            if (existFemResFilesFolder) {
                const femResFilesFolderHandler = await dtFolder.getDirectoryHandle('femResFiles');
                for await (let femResFilesName of femResFilesFolderHandler.keys()) {
                    if (femResFilesName !== "metadata.txt") {
                        item.numFemResFiles += 1;
                    }
                }
            }
            dtStorageInfo.push(item);

        }
    }
    return dtStorageInfo;
}




