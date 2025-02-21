import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { nanoid } from "nanoid";
import { GLTFLoader } from 'three-stdlib';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import {
    axiosAuth,
    checkGltfFile,
    convertArrayToOptions,
    digitalTwinFormatValidation,
    getDomainName,
    getProtocol,
    IOption
} from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDigitalTwinsOptionToShow, useDigitalTwinsDispatch } from '../../../contexts/digitalTwinsOptions';
import { useFilePicker } from 'use-file-picker';
import formatDateString from '../../../tools/formatDate';
import {
    setReloadDashboardsTable,
    setReloadSensorsTable,
    setReloadTopicsTable,
    useAssetsTable,
    useGroupsManagedTable,
    useOrgsOfGroupsManagedTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IAsset } from '../TableColumns/assetsColumns';
import { ControlsContainer, FormContainer } from './CreateAsset';
import { AxiosError, AxiosResponse } from 'axios';

const DataFileTitle = styled.div`
    margin-bottom: 5px;
`;

const DataFileContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
`;

const SelectDataFilenButtonContainer = styled.div`
    display: flex;
    margin-bottom: 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const FileButton = styled.button`
	background-color: #3274d9;
	padding: 5px 10px;
    margin: 5px 10px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;
    width: 40%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const FieldContainer = styled.div`
    margin: 20px 0;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }

    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;
    }
`;

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

export interface ITopicRef {
    topicId: number;
    topicRef: string;
}

const domainName = getDomainName();
const protocol = getProtocol();

const digitalTwinTypeOptions = [
    {
        label: "Grafana dashboard",
        value: "Grafana dashboard"
    },
    {
        label: "Glb 3D model",
        value: "Glb 3D model"
    },
    {
        label: "Gltf 3D model",
        value: "Gltf 3D model"
    }
];

export const getSensorsRefFromDigitalTwinGltfData = (
    digitalTwinGltfData: any,
) => {
    const sensorsRef: string[] = [];
    if (typeof digitalTwinGltfData === "string") digitalTwinGltfData = JSON.parse(digitalTwinGltfData);
    if (Object.keys(digitalTwinGltfData).length && digitalTwinGltfData.nodes?.length !== 0) {
        digitalTwinGltfData.nodes.forEach(
            (
                node: {
                    name?: string; mesh?: number;
                    extras: {
                        animationType: string;
                        topicType: string;
                        objectOnOff: string;
                        sensorRef: string;
                        type: string;
                        clipSensorRef: string;
                    };
                }
            ) => {
                // if (node.mesh !== undefined && node.extras !== undefined) {
                if (node.extras !== undefined) {
                    if (node.extras.type && node.extras.type === "sensor") {
                        const sensorRef = node.extras?.sensorRef;
                        if (sensorRef) {
                            if (sensorsRef.indexOf(sensorRef) === -1) {
                                sensorsRef.push(sensorRef);
                            }
                        }
                    }
                    if (node.extras.clipSensorRef !== undefined) {
                        const clipSensorRef = node.extras?.clipSensorRef;
                        if (clipSensorRef) {
                            if (sensorsRef.indexOf(clipSensorRef) === -1) {
                                sensorsRef.push(clipSensorRef);
                            }
                        }
                    }
                }

            })
    }
    return sensorsRef;
}

const findGroupArray = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) {
            groupArray[orgAcronym].push(group.acronym);
        }
    }
    return groupArray;
}

const findAssetNameArray = (
    assetsManaged: IAsset[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {}
    for (const asset of assetsManaged) {
        const groupAcronym = groupsManaged.filter(group => group.id === asset.groupId)[0].acronym;
        if (assetArray[groupAcronym] === undefined) {
            assetArray[groupAcronym] = [];
        }
        const assetName = `Asset_${asset.assetUid}`;
        if (assetArray[groupAcronym].indexOf(assetName) === -1) {
            assetArray[groupAcronym].push(assetName);
        }
    }
    return assetArray;
}

const findAssetDescription = (
    assetsManaged: IAsset[],
    assetName: string
): string => {
    const assetManaged = assetsManaged.filter(asset => `Asset_${asset.assetUid}` === assetName)[0];
    return assetManaged.description;
}


interface CreateDigitalTwinProps {
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

interface IFormikValues {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    digitalTwinUid: string;
    description: string;
    type: string;
    maxNumResFemFiles: string;
    digitalTwinSimulationFormat: string;
}

export type ObjectMap = {
    nodes: { [name: string]: THREE.Object3D }
    materials: { [name: string]: THREE.Material }
}

export function buildGraph(object: THREE.Object3D) {
    const data: ObjectMap = { nodes: {}, materials: {} }
    if (object) {
        object.traverse((obj: any) => {
            if (obj.name) data.nodes[obj.name] = obj
            if (obj.material && !data.materials[obj.material.name]) data.materials[obj.material.name] = obj.material
        })
    }
    return data
}

export function getSensorsRef(object: THREE.Object3D) {
    const sensorsRef: string[] = [];
    if (object) {
        object.traverse((node: any) => {
            if (node.name) {
                if (node.userData !== undefined) {
                    if (node.userData.type && node.userData.type === "sensor") {
                        const sensorRef = node.userData?.sensorRef;
                        if (sensorRef) {
                            if (sensorsRef.indexOf(sensorRef) === -1) {
                                sensorsRef.push(sensorRef);
                            }
                        }
                    }
                    if (node.userData.clipSensorRef !== undefined) {
                        const clipSensorRef = node.userData?.clipSensorRef;
                        if (clipSensorRef) {
                            if (sensorsRef.indexOf(clipSensorRef) === -1) {
                                sensorsRef.push(clipSensorRef);
                            }
                        }
                    }
                }
            }
        })
    }
    return sensorsRef
}

type FormikType = FormikProps<IFormikValues>

const CreateDigitalTwin: FC<CreateDigitalTwinProps> = ({ backToTable, refreshDigitalTwins }) => {
    const digitalTwinUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const orgsOfGroupManaged = useOrgsOfGroupsManagedTable();
    const groupsManaged = useGroupsManagedTable();
    const assets = useAssetsTable();
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter(group => group.orgId === initOrg.id)[0];
    const initAsset = assets.filter(asset => asset.groupId === initGroup.id)[0];
    const initAssetName = `Asset_${initAsset.assetUid}`;
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>("");
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFile, setGltfFile] = useState<File>();
    const [isValidGltfFile, setIsValidGltfFile] = useState<boolean>(false);
    const [gltfFileContent, setGltfFileContent] = useState<string>();
    const [gltfFileName, setGltfFileName] = useState("-");
    const [gltfFileLastModif, setGltfFileLastModif] = useState("-");
    //const [digitalTwinGltfData, setDigitalTwinGltfData] = useState({});
    const [localFemResFileLoaded, setLocalFemResFileLoaded] = useState(false);
    const [digitalTwinFemResData, setDigitalTwiFemResData] = useState({});
    const [femResFile, setFemResFile] = useState<File>();
    const [femResFileName, setFemResFileName] = useState("-");
    const [femResFileLastModifDateString, setFemResFileLastModifDateString] = useState("-");
    const [digitalTwinType, setDigitalTwinType] = useState("Grafana dashboard");
    const [isGlftDataReady, setIsGlftDataReady] = useState(false);
    const [sensorsRef, setSensorsRef] = useState<string[]>([]);

    useEffect(() => {
        const orgArray = orgsOfGroupManaged.map(org => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = initOrg.acronym;
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const assetNameArray = findAssetNameArray(assets, groupsManaged);
        setAssetNameArray(assetNameArray);
        const groupAcronym = initGroup.acronym;
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = `Asset_${initAsset.assetUid}`;
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    }, [
        assets,
        groupsManaged,
        initAsset.assetUid,
        initGroup.acronym,
        initOrg.acronym,
        orgsOfGroupManaged,
    ]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupsForOrgSelected[0]);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    }

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    }

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    }

    const [openGlftFileSelector, gltfFileParams] = useFilePicker({
        readAs: digitalTwinType === "Gltf 3D model" ? 'Text' : 'DataURL',
        multiple: false,
        accept: digitalTwinType === "Gltf 3D model" ? '.gltf' : '.glb',
    });


    const [openFemResFileSelector, femResFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.json',
    });

    useEffect(() => {
        if (gltfFileContent === undefined || gltfFileName === "-") return;
        if (gltfFileName.slice(-3) === "glb") {
            const loader = new GLTFLoader();
            loader.loadAsync(gltfFileContent)
                .then((gltf) => {
                    const sensorsRef = getSensorsRef(gltf.scene);
                    setSensorsRef(sensorsRef);
                    setIsValidGltfFile(true);
                })
                .catch((error) => {
                    if (error instanceof Error) {
                        toast.error(`Invalid gltffile. ${error.message}`);
                    } else {
                        toast.error("Invalid gltffile");
                    }
                    setGltfFileContent(undefined);
                    setLocalGltfFileLoaded(false);
                    setIsValidGltfFile(false);
                    gltfFileParams.clear();
                })
        } else if (gltfFileName.slice(-4) === "gltf") {
            const gltfData = JSON.parse(gltfFileContent);
            const message = checkGltfFile(gltfData);
            if (message !== "OK") {
                setIsValidGltfFile(false);
                throw new Error(message);
            }
            const sensorsRef = getSensorsRefFromDigitalTwinGltfData(gltfData);
            setSensorsRef(sensorsRef);
            //setDigitalTwinGltfData(gltfData);
            setIsValidGltfFile(true);
        }
    },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [gltfFileContent]
    );


    useEffect(() => {
        if (
            !gltfFileParams.loading &&
            gltfFileParams.filesContent.length !== 0 &&
            gltfFileParams.plainFiles.length !== 0
        ) {
            setLocalGltfFileLoaded(true)
            try {

                const fileContent = gltfFileParams.filesContent[0].content
                setGltfFileContent(fileContent);
                setGltfFile(gltfFileParams.plainFiles[0]);
                const gltfFileName = gltfFileParams.plainFiles[0].name;
                setGltfFileName(gltfFileName);
                const dateString = (gltfFileParams.plainFiles[0] as any).lastModified;
                setGltfFileLastModif(formatDateString(dateString));
                setLocalGltfFileLoaded(false);
                gltfFileParams.clear();
                setIsGlftDataReady(true);
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid gltffile. ${error.message}`);
                } else {
                    toast.error("Invalid gltffile");
                }
                setLocalGltfFileLoaded(false);
                gltfFileParams.clear();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        gltfFileParams.loading,
        gltfFileParams.filesContent,
        gltfFileParams.plainFiles,
        gltfFileParams,
    ])

    useEffect(() => {
        if (!femResFileParams.loading && femResFileParams.filesContent.length !== 0 && femResFileParams.plainFiles.length !== 0) {
            setLocalFemResFileLoaded(true);
            try {
                const fileContent = femResFileParams.filesContent[0].content
                const femResData = JSON.parse(fileContent);
                setDigitalTwiFemResData(femResData);
                setFemResFile(femResFileParams.plainFiles[0]);
                const femResFileName = femResFileParams.plainFiles[0].name;
                setFemResFileName(femResFileName);
                const dateString = (femResFileParams.plainFiles[0] as any).lastModified;
                setFemResFileLastModifDateString(formatDateString(dateString));
                setLocalFemResFileLoaded(false);
                femResFileParams.clear();
            } catch (e) {
                console.log(e);
                toast.error("Invalid fem simulation file");
                setLocalFemResFileLoaded(false);
                femResFileParams.clear();
            }
        }
    },
        [
            femResFileParams.loading,
            femResFileParams.filesContent,
            femResFileParams.plainFiles,
            femResFileParams
        ]);


    const onSubmit = (values: any, actions: any) => {
        const groupId = groupsManaged.filter(group => group.acronym === values.groupAcronym)[0].id;
        const assetName = values.assetName;
        const assetId = assets.filter(asset => asset.assetUid === assetName.slice(6))[0].id;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);

        const maxNumResFemFiles = parseInt(values.maxNumResFemFiles, 10);
        const digitalTwinData = {
            description: values.description,
            type: values.type,
            digitalTwinUid: values.digitalTwinUid,
            maxNumResFemFiles,
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat)),
            sensorsRef
        };

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, digitalTwinData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
                const configMultipart = axiosAuth(accessToken, "multipart/form-data")
                const urlUploadGltfBase0 = `${protocol}://${domainName}/admin_api/digital_twin_upload_file`;
                const urlUploadGltfBase = `${urlUploadGltfBase0}/${groupId}/${data.digitalTwinId}`;

                if (isValidGltfFile && (values.type === "Gltf 3D model" || values.type === "Glb 3D model")) {
                    let file = gltfFile as File;
                    const gltfData = new FormData();
                    gltfData.append("file", file, gltfFileName);

                    const urlUploadGltfFile = `${urlUploadGltfBase}/gltfFile/${gltfFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadGltfFile, gltfData, configMultipart)
                        .then((response: AxiosResponse<any, any>) => {
                            toast.success(response.data.message);
                        })
                        .catch((error: AxiosError) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })
                }

                if (Object.keys(digitalTwinFemResData).length !== 0) {
                    const femResData = new FormData();
                    femResData.append("file", femResFile as File, "femResFile");
                    const urlUploadFemResFile = `${urlUploadGltfBase}/femResFiles/${femResFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadFemResFile, femResData, configMultipart)
                        .then((response: AxiosResponse<any, any>) => {
                            toast.success(response.data.message);
                        })
                        .catch((error: AxiosError) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })
                }


            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshDigitalTwins();
                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadSensorsTable = true;
                setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            })
    }

    const validationSchema = Yup.object().shape({
        digitalTwinUid: Yup.string().length(20, "String must be 20 characters long").required('Required'),
        description: Yup.string().required('Required'),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required('Required'),
        maxNumResFemFiles: Yup.number()
            .when("type",
                {
                    is: "Gltf 3D model",
                    then: Yup.number().min(1, "The minimum numer of FEM results files is 1").required("Must enter maxNumResFemFiles")
                }
            )
            .when("type",
                {
                    is: "Glb 3D model",
                    then: Yup.number().min(1, "The minimum numer of FEM results files is 1").required("Must enter maxNumResFemFiles")
                }
            ),
        digitalTwinSimulationFormat: Yup.string()
        .when("type", {
            is: "Gltf 3D model",
            then: Yup.string()
                .test("test-name", "Wrong format for the json object", (value: any) => digitalTwinFormatValidation(value))
                .required("Must enter Digital twin simulation format")
        })        
        .when("type", {
            is: "Glb 3D model",
            then: Yup.string()
                .test("test-name", "Wrong format for the json object", (value: any) => digitalTwinFormatValidation(value))
                .required("Must enter Digital twin simulation format")
        }),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onDigitalTwinTypeSelectChange = (e: { value: string }, formik: FormikType) => {
        setDigitalTwinType(e.value);
        formik.setFieldValue("type", e.value)
    }

    const clearGltfDataFile = () => {
        setGltfFileName("-");
        setGltfFileLastModif("-");
        //setDigitalTwinGltfData({});
        setLocalGltfFileLoaded(false);
        gltfFileParams.clear();
        setIsGlftDataReady(false);
    }

    const localGltfFileButtonHandler = async () => {
        if (!localGltfFileLoaded) {
            selectFile(openGlftFileSelector, gltfFileParams.clear);
        }
    }

    const clearFemResFile = () => {
        setFemResFileName("-");
        setFemResFileLastModifDateString("-");
        setDigitalTwiFemResData({});
        setLocalFemResFileLoaded(false);
        femResFileParams.clear();
    }

    const localFemResFileButtonHandler = () => {
        if (!localFemResFileLoaded) {
            selectFile(openFemResFileSelector, femResFileParams.clear);
        }
    }

    const initialDigitalTwinData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        assetName: initAssetName,
        description: "",
        type: "Grafana dashboard",
        digitalTwinUid,
        maxNumResFemFiles: "1",
        digitalTwinSimulationFormat: "{}"
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create digital twin</FormTitle>
            <FormContainer>
                <Formik
                    initialValues={initialDigitalTwinData}
                    validationSchema={validationSchema}
                    onSubmit={onSubmit}
                >
                    {
                        formik => {
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='select'
                                            label='Select org'
                                            name='orgAcronym'
                                            type='text'
                                            options={orgOptions}
                                            onChange={(e) => handleChangeOrg(e, formik)}
                                        />
                                        <FormikControl
                                            control='select'
                                            label='Select group'
                                            name='groupAcronym'
                                            type='text'
                                            options={groupOptions}
                                            onChange={(e) => handleChangeGroup(e, formik)}
                                        />
                                        <FormikControl
                                            control='select'
                                            label='Select asset'
                                            name='assetName'
                                            type='text'
                                            options={assetNameOptions}
                                            onChange={(e) => handleChangeAsset(e, formik)}
                                        />
                                        <FieldContainer>
                                            <label>Asset description</label>
                                            <div>{assetDescription}</div>
                                        </FieldContainer>
                                        <FormikControl
                                            control='input'
                                            label='DigitalTwinUid'
                                            name='digitalTwinUid'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Description'
                                            name='description'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='select'
                                            label='Type'
                                            name="type"
                                            options={digitalTwinTypeOptions}
                                            type='text'
                                            onChange={(e) => onDigitalTwinTypeSelectChange(e, formik)}
                                        />
                                        {
                                            (digitalTwinType === "Gltf 3D model" || digitalTwinType === "Glb 3D model") &&
                                            <>
                                                <DataFileTitle>Gltf data file</DataFileTitle>
                                                <DataFileContainer>
                                                    <FieldContainer>
                                                        <label>File name</label>
                                                        <div>{gltfFileName}</div>
                                                    </FieldContainer>
                                                    <FieldContainer>
                                                        <label>Last modification date</label>
                                                        <div>{gltfFileLastModif}</div>
                                                    </FieldContainer>
                                                    <SelectDataFilenButtonContainer >
                                                        <FileButton
                                                            type='button'
                                                            onClick={clearGltfDataFile}
                                                        >
                                                            Clear
                                                        </FileButton>
                                                        <FileButton
                                                            type='button'
                                                            onClick={() => localGltfFileButtonHandler()}
                                                        >
                                                            Select local file
                                                        </FileButton>
                                                    </SelectDataFilenButtonContainer>
                                                </DataFileContainer>
                                                <DataFileTitle>FEM results file</DataFileTitle>
                                                <DataFileContainer>
                                                    <FormikControl
                                                        control='input'
                                                        label='Max number of FEM result files stored'
                                                        name='maxNumResFemFiles'
                                                        type='text'
                                                    />
                                                    <FieldContainer>
                                                        <label>File name</label>
                                                        <div>{femResFileName}</div>
                                                    </FieldContainer>
                                                    <FieldContainer>
                                                        <label>Last modification date</label>
                                                        <div>{femResFileLastModifDateString}</div>
                                                    </FieldContainer>
                                                    <SelectDataFilenButtonContainer >
                                                        <FileButton
                                                            type='button'
                                                            onClick={clearFemResFile}
                                                        >
                                                            Clear
                                                        </FileButton>
                                                        <FileButton
                                                            type='button'
                                                            onClick={() => localFemResFileButtonHandler()}
                                                        >
                                                            Select local file
                                                        </FileButton>
                                                    </SelectDataFilenButtonContainer>
                                                </DataFileContainer>
                                                <FormikControl
                                                    control='textarea'
                                                    label='Digital twin simulation format'
                                                    name='digitalTwinSimulationFormat'
                                                    textAreaSize='Small'
                                                />
                                            </>

                                        }
                                    </ControlsContainer>
                                    <FormButtonsProps
                                        onCancel={onCancel}
                                        isValid={
                                            formik.isValid &&
                                            (isGlftDataReady || formik.values.type === "Grafana dashboard")
                                        }
                                        isSubmitting={formik.isSubmitting}
                                    />
                                </Form>
                            )
                        }
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default CreateDigitalTwin;