import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { nanoid } from "nanoid";
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, digitalTwinFormatValidation, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDigitalTwinsOptionToShow, useDigitalTwinsDispatch } from '../../../contexts/digitalTwinsOptions';
import { useFilePicker } from 'use-file-picker';
import formatDateString from '../../../tools/formatDate';
import { setReloadDashboardsTable, setReloadTopicsTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 300px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 435px);
    width: 100%;
    padding: 0px 5px;
    overflow-y: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    div:first-child {
        margin-top: 0;
    }

    div:last-child {
        margin-bottom: 3px;
    }
`;

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

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}


const domainName = getDomainName();
const protocol = getProtocol();

const initialDigitalTwinData = {
    groupId: "",
    deviceId: "",
    description: "",
    type: "Grafana dashboard",
    digitalTwinUid: "",
    gltfFileName: "-",
    gltfFileLastModifDateString: "-",
    femSimDataFileName: "-",
    femSimDataFileLastModifDateString: "-",
    digitalTwinSimulationFormat: "{}",
}

const digitalTwinTypeOptions = [
    {
        label: "Grafana dashboard",
        value: "Grafana dashboard"
    },
    {
        label: "Gltf 3D model",
        value: "Gltf 3D model"
    }
];


interface CreateDigitalTwinProps {
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

type FormikType = FormikProps<{
    groupId: string;
    deviceId: string;
    digitalTwinUid: string;
    description: string;
    type: string;
    gltfFileName: string;
    gltfFileLastModifDateString: string;
    femSimDataFileName: string;
    femSimDataFileLastModifDateString: string;
    digitalTwinSimulationFormat: string;
}>

const CreateDigitalTwin: FC<CreateDigitalTwinProps> = ({ backToTable, refreshDigitalTwins }) => {
    initialDigitalTwinData.digitalTwinUid = `DT_${nanoid(20).replace(/-/g, "x").replace(/_/g, "X")}`
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFile, setGltfFile] = useState<File>();
    const [localGltfFileLabel, setLocalGltfFileLabel] = useState("Select local file");
    const [digitalTwinGltfData, setDigitalTwinGltfData] = useState({});
    const [localFemSimFileLoaded, setLocalFemSimFileLoaded] = useState(false);
    const [localFemSimFileLabel, setLocalFemSimFileLabel] = useState("Select local file");
    const [digitalTwinFemSimData, setDigitalTwiFemSimData] = useState({});
    const [femSimulationFile, setFemSimulationFile] = useState<File>();
    const [digitalTwinType, setDigitalTwinType] = useState("Grafana dashboard");
    const [openGlftFileSelector, gltfFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.gltf',
    });

    const [openFemSimulationFileSelector, femSimFileParms] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.json',
    });

    useEffect(() => {
        if (!gltfFileParams.loading && gltfFileParams.filesContent.length !== 0 && gltfFileParams.plainFiles.length !== 0) {
            setLocalGltfFileLoaded(true)
            setLocalGltfFileLabel("Add file data");
        }
    }, [gltfFileParams.loading, gltfFileParams.filesContent, gltfFileParams.plainFiles])

    useEffect(() => {
        if (!femSimFileParms.loading && femSimFileParms.filesContent.length !== 0 && femSimFileParms.plainFiles.length !== 0) {
            setLocalFemSimFileLoaded(true)
            setLocalFemSimFileLabel("Add file data");
        }
    }, [femSimFileParms.loading, femSimFileParms.filesContent, femSimFileParms.plainFiles])

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const deviceId = values.deviceId;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${deviceId}`;
        const config = axiosAuth(accessToken);

        const gltfFileDate = values.gltfFileLastModifDateString === "-" ? "-" : new Date(values.gltfFileLastModifDateString);
        const femSimFileDate = values.femSimDataFileLastModifDateString === "-" ? "-" : new Date(values.femSimDataFileLastModifDateString);

        const digitalTwinData = {
            description: values.description,
            type: values.type,
            digitalTwinUid: values.digitalTwinUid,
            gltfFileName: values.gltfFileName,
            gltfFileLastModifDateString: gltfFileDate.toString(),
            femSimDataFileName: values.femSimDataFileName,
            femSimDataFileLastModifDateString: femSimFileDate.toString(),
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat))
        }

        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .post(url, digitalTwinData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
                refreshDigitalTwins();

                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });

                const configMultipart = axiosAuth(accessToken, "multipart/form-data")
                const urlUploadGltfBase = `${protocol}://${domainName}/admin_api/digital_twin_upload_file`;
                const urlUploadDigitalTwinFile = `${urlUploadGltfBase}/${groupId}/${deviceId}/${data.digitalTwinId}`;

                if (Object.keys(digitalTwinGltfData).length !== 0) {
                    const gltfData = new FormData();
                    gltfData.append("file", gltfFile as File, "gltfFile");
                    axiosInstance(refreshToken, authDispatch)
                        .post(urlUploadDigitalTwinFile, gltfData, configMultipart )
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            const errorMessage = error.response.data?.message;
                            if (errorMessage !== undefined && errorMessage !== "jwt expired") toast.error(errorMessage);
                            backToTable();
                        })
                }

                if (Object.keys(digitalTwinFemSimData).length !== 0) {
                    const femResData = new FormData();
                    femResData.append("file", femSimulationFile as File, "femResFile");
                    axiosInstance(refreshToken, authDispatch)
                        .post(urlUploadDigitalTwinFile, femResData, configMultipart )
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            const errorMessage = error.response.data?.message;
                            if (errorMessage !== undefined && errorMessage !== "jwt expired") toast.error(errorMessage);
                            backToTable();
                        })
                }


            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if (errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        deviceId: Yup.number().required('Required'),
        digitalTwinUid: Yup.string().max(23, "The maximum number of characters allowed is 23").required('Required'),
        description: Yup.string().required('Required'),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required('Required'),
        gltfFileName: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().required("Must enter gltfFileName")
        }),
        gltfFileLastModifDateString: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Must enter gltfFileLastModifDateString")
        }),
        femSimDataFileName: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Must enter femSimDataFileName")
        }),
        femSimDataFileLastModifDateString: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Must enter femSimDataFileLastModifDateString")
        }),
        digitalTwinSimulationFormat: Yup.string().when("type", {
            is: "Gltf 3D model",
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

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create digital twin</FormTitle>
            <FormContainer>
                <Formik initialValues={initialDigitalTwinData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            const clearGltfDataFile = () => {
                                const values = { ...formik.values };
                                values.gltfFileName = "-";
                                values.gltfFileLastModifDateString = "-";
                                formik.setValues(values);
                                setLocalGltfFileLabel("Select local file");
                                setDigitalTwinGltfData({});
                                setLocalGltfFileLoaded(false);
                                gltfFileParams.clear();
                            }

                            const localGltfFileButtonHandler = () => {
                                if (!localGltfFileLoaded) {
                                    selectFile(openGlftFileSelector, gltfFileParams.clear);
                                } else {
                                    try {
                                        const values = { ...formik.values };
                                        const fileContent = gltfFileParams.filesContent[0].content
                                        const gltfData = JSON.parse(fileContent);
                                        setDigitalTwinGltfData(gltfData);
                                        setGltfFile(gltfFileParams.plainFiles[0])
                                        values.gltfFileName = gltfFileParams.plainFiles[0].name;
                                        const dateString = (gltfFileParams.plainFiles[0] as any).lastModifiedDate.toString();
                                        values.gltfFileLastModifDateString = formatDateString(dateString);
                                        formik.setValues(values);
                                        setLocalGltfFileLabel("Select local file");
                                        gltfFileParams.clear();
                                    } catch (e) {
                                        console.error(e);
                                        toast.error("Invalid gltffile");
                                        setLocalGltfFileLabel("Select local file");
                                        setLocalGltfFileLoaded(false);
                                        gltfFileParams.clear();
                                    }
                                }
                            }

                            const clearFemSimDataFile = () => {
                                const values = { ...formik.values };
                                values.femSimDataFileName = "-";
                                values.femSimDataFileLastModifDateString = "-";
                                formik.setValues(values);
                                setLocalFemSimFileLabel("Select local file");
                                setDigitalTwiFemSimData({});
                                setLocalFemSimFileLoaded(false);
                                femSimFileParms.clear();
                            }

                            const localFemSimFileButtonHandler = () => {
                                if (!localFemSimFileLoaded) {
                                    selectFile(openFemSimulationFileSelector, femSimFileParms.clear);
                                } else {
                                    try {
                                        const values = { ...formik.values };
                                        const fileContent = femSimFileParms.filesContent[0].content
                                        const femSimData = JSON.parse(fileContent);
                                        setDigitalTwiFemSimData(femSimData);
                                        setFemSimulationFile(femSimFileParms.plainFiles[0]);
                                        values.femSimDataFileName = femSimFileParms.plainFiles[0].name;
                                        const dateString = (femSimFileParms.plainFiles[0] as any).lastModifiedDate.toString();
                                        values.femSimDataFileLastModifDateString = formatDateString(dateString);
                                        formik.setValues(values);
                                        setLocalFemSimFileLabel("Select local file");
                                        femSimFileParms.clear();
                                    } catch (e) {
                                        console.error(e);
                                        toast.error("Invalid fem simulation file");
                                        setLocalFemSimFileLabel("Select local file");
                                        setLocalFemSimFileLoaded(false);
                                        femSimFileParms.clear();
                                    }
                                }
                            }

                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='input'
                                            label='GroupId'
                                            name='groupId'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='DeviceId'
                                            name='deviceId'
                                            type='text'
                                        />
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
                                            digitalTwinType === "Gltf 3D model" &&
                                            <>
                                                <DataFileTitle>Gltf data file</DataFileTitle>
                                                <DataFileContainer>
                                                    <FormikControl
                                                        control='input'
                                                        label='File name'
                                                        name='gltfFileName'
                                                        type='text'
                                                    />
                                                    <FormikControl
                                                        control='input'
                                                        label='Last modification date'
                                                        name='gltfFileLastModifDateString'
                                                        type='text'
                                                    />
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
                                                            {localGltfFileLabel}
                                                        </FileButton>
                                                    </SelectDataFilenButtonContainer>
                                                </DataFileContainer>
                                                <DataFileTitle>Fem simulation data file</DataFileTitle>
                                                <DataFileContainer>
                                                    <FormikControl
                                                        control='input'
                                                        label='File name'
                                                        name='femSimDataFileName'
                                                        type='text'
                                                    />
                                                    <FormikControl
                                                        control='input'
                                                        label='Last modification date'
                                                        name='femSimDataFileLastModifDateString'
                                                        type='text'
                                                    />
                                                    <SelectDataFilenButtonContainer >
                                                        <FileButton
                                                            type='button'
                                                            onClick={clearFemSimDataFile}
                                                        >
                                                            Clear
                                                        </FileButton>
                                                        <FileButton
                                                            type='button'
                                                            onClick={() => localFemSimFileButtonHandler()}
                                                        >
                                                            {localFemSimFileLabel}
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
                                    <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
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