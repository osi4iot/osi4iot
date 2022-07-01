import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDigitalTwinsOptionToShow, useDigitalTwinIdToEdit, useDigitalTwinRowIndexToEdit, useDigitalTwinsDispatch } from '../../../contexts/digitalTwinsOptions';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import Loader from '../../Tools/Loader';
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

interface EditDigitalTwinProps {
    digitalTwins: IDigitalTwin[];
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

type FormikType = FormikProps<{
    digitalTwinUid: string;
    description: string;
    type: string;
    gltfFileName: string;
    gltfFileLastModifDateString: string;
    femSimDataFileName: string;
    femSimDataFileLastModifDateString: string;
    digitalTwinSimulationFormat: string;
}>;

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ digitalTwins, backToTable, refreshDigitalTwins }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const digitalTwinRowIndex = useDigitalTwinRowIndexToEdit();
    const digitalTwinId = useDigitalTwinIdToEdit();
    const groupId = digitalTwins[digitalTwinRowIndex].groupId;
    const deviceId = digitalTwins[digitalTwinRowIndex].deviceId;
    const storedDigitalTwinType = digitalTwins[digitalTwinRowIndex].type;
    const [digitalTwinGltfDataLoading, setDigitalTwinGltfDataLoading] = useState(true);
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [localGltfFileLabel, setLocalGltfFileLabel] = useState("Select local file");
    const [digitalTwinGltfData, setDigitalTwinGltfData] = useState({});
    const [localFemSimFileLoaded, setLocalFemSimFileLoaded] = useState(false);
    const [localFemSimFileLabel, setLocalFemSimFileLabel] = useState("Select local file");
    const [digitalTwinFemSimData, setDigitalTwiFemSimData] = useState({});
    const [digitalTwinType, setDigitalTwinType] = useState(digitalTwins[digitalTwinRowIndex].type);

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
        if (storedDigitalTwinType === "Gltf 3D model") {
            const config = axiosAuth(accessToken);
            let urlDigitalTwinGltfData = `${protocol}://${domainName}/admin_api/digital_twin_gltfdata`;
            urlDigitalTwinGltfData = `${urlDigitalTwinGltfData}/${groupId}/${deviceId}/${digitalTwinId}`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlDigitalTwinGltfData, config)
                .then((response) => {
                    const digitalTwinGltfData = response.data;
                    setDigitalTwinGltfData(digitalTwinGltfData.gltfData);
                    setDigitalTwiFemSimData(digitalTwinGltfData.femSimulationData);
                    setDigitalTwinGltfDataLoading(false);
                    setIsSubmitting(false);
                })
                .catch((error) => {
                    const errorMessage = error.response.data.message;
                    if(errorMessage !== "jwt expired") toast.error(errorMessage);
                    setDigitalTwinGltfDataLoading(false);
                    backToTable();
                })
        } else setDigitalTwinGltfDataLoading(false);
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        backToTable,
        storedDigitalTwinType,
        digitalTwinId,
        groupId,
        deviceId
    ])

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
        const groupId = digitalTwins[digitalTwinRowIndex].groupId;
        const deviceId = digitalTwins[digitalTwinRowIndex].deviceId;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${deviceId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);

        setIsSubmitting(true);

        const gltfFileDate = values.gltfFileLastModifDateString === "-" ? "-" : new Date(values.gltfFileLastModifDateString);
        const femSimFileDate = values.femSimDataFileLastModifDateString === "-" ? "-" : new Date(values.femSimDataFileLastModifDateString);

        const digitalTwinData = {
            digitalTwinUid: values.digitalTwinUid,
            description: values.description,
            type: values.type,
            gltfData: JSON.stringify(digitalTwinGltfData),
            gltfFileName: values.gltfFileName,
            gltfFileLastModifDateString: gltfFileDate.toString(),
            femSimulationData: JSON.stringify(digitalTwinFemSimData),
            femSimDataFileName: values.femSimDataFileName,
            femSimDataFileLastModifDateString: femSimFileDate.toString(),
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat)),
        }

        axiosInstance(refreshToken, authDispatch)
            .patch(url, digitalTwinData, config)
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
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if(errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }

    const initialDigitalTwinData = {
        digitalTwinUid: digitalTwins[digitalTwinRowIndex].digitalTwinUid,
        description: digitalTwins[digitalTwinRowIndex].description,
        type: digitalTwins[digitalTwinRowIndex].type,
        gltfFileName: digitalTwins[digitalTwinRowIndex].gltfFileName,
        gltfFileLastModifDateString: formatDateString(digitalTwins[digitalTwinRowIndex].gltfFileLastModifDateString),
        femSimDataFileName: digitalTwins[digitalTwinRowIndex].femSimDataFileName,
        femSimDataFileLastModifDateString: formatDateString(digitalTwins[digitalTwinRowIndex].femSimDataFileLastModifDateString),
        digitalTwinSimulationFormat: JSON.stringify(digitalTwins[digitalTwinRowIndex].digitalTwinSimulationFormat, null, 4)
    }

    const validationSchema = Yup.object().shape({
        digitalTwinUid: Yup.string().max(25, "The maximum number of characters allowed is 25").required('Required'),
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
            then: Yup.string().required("Must enter Digital twin simulation format")
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
            {
                digitalTwinGltfDataLoading ?
                    <Loader />
                    :
                    <>
                        <FormTitle isSubmitting={isSubmitting} >Edit digital twin</FormTitle>
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
                                                        label='Ref'
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
            }
        </>
    )
}

export default EditDigitalTwin;