import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../Tools/FormikControl";
import FormButtonsProps from "../Tools/FormButtons";
import FormTitle from "../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from './platformAssistantOptions';
import { setDigitalTwinsOptionToShow, useDigitalTwinIdToEdit, useDigitalTwinRowIndexToEdit, useDigitalTwinsDispatch } from '../../contexts/digitalTwinsOptions';
import { IDigitalTwin } from './TableColumns/digitalTwinsColumns';
import { useFilePicker } from 'use-file-picker';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 340px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 475px);
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

const GltfDataFileTitle = styled.div`
    margin-bottom: 5px;
`;

const GltfDataFileContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
`;

const SelectGltfDataFilenButtonContainer = styled.div`
    display: flex;
    margin-bottom: 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const SelectFileButton = styled.button`
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
    width: 80%;

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

type FormikType = FormikProps<{ name: string; description: string; type: string; dashboardId: string; gltfData: string; }>;

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ digitalTwins, backToTable, refreshDigitalTwins }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const digitalTwinRowIndex = useDigitalTwinRowIndexToEdit();
    const digitalTwinId = useDigitalTwinIdToEdit();
    const [localFileContent, setLocalFileContent] = useState("");
    const [localFileLoaded, setLocalFileLoaded] = useState(false);
    const [localFileLabel, setLocalFileLabel] = useState("Select local file");
    const [digitalTwinType, setDigitalTwinType] = useState(digitalTwins[digitalTwinRowIndex].type);
    const [openFileSelector, { filesContent, plainFiles, loading, clear }] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.gltf',
    });

    useEffect(() => {
        if (!loading && filesContent.length !== 0 && plainFiles.length !== 0) {
            setLocalFileContent(filesContent[0].content);
            setLocalFileLoaded(true)
            setLocalFileLabel(`Add gltf data from ${plainFiles[0].name} file`);
        }
    }, [loading, filesContent, plainFiles])

    const resetFileSelect = (e: SyntheticEvent) => {
        e.preventDefault();
        setLocalFileLabel("Select local file");
        setLocalFileContent("");
        setLocalFileLoaded(false);
        clear();
    }

    const onSubmit = (values: any, actions: any) => {
        const groupId = digitalTwins[digitalTwinRowIndex].groupId;
        const deviceId = digitalTwins[digitalTwinRowIndex].deviceId;
        const url = `https://${domainName}/admin_api/digital_twin/${groupId}/${deviceId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);
        
        values.dashboardId = parseInt(values.dashboardId, 10);
        values.gltfData = JSON.stringify(JSON.parse(values.gltfData));
        setIsSubmitting(true);

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
                refreshDigitalTwins();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }


    const initialTopicData = {
        name: digitalTwins[digitalTwinRowIndex].name,
        description: digitalTwins[digitalTwinRowIndex].description,
        type: digitalTwins[digitalTwinRowIndex].type,
        dashboardId: digitalTwins[digitalTwinRowIndex].dashboardId,
        gltfData: JSON.stringify(digitalTwins[digitalTwinRowIndex].gltfData, null, 4)
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        description: Yup.string().required('Required'),
        type: Yup.string().max(20, "The maximum number of characters allowed is 190").required('Required'),
        dashboardId: Yup.number().when("type", {
            is: "Grafana dashboard",
            then: Yup.number().required("Must enter dashboardId"),
            otherwise: Yup.number().default(-1).nullable()
        }),
        gltfData: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().required("Must enter gltfData"),
            otherwise: Yup.string().default('{}').nullable()
        })
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onDigitalTwinTypeSelectChange = (e: {value: string}, formik: FormikType) => {
        setDigitalTwinType(e.value);
        formik.setFieldValue("type", e.value)
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit digital twin</FormTitle>
            <FormContainer>
                <Formik initialValues={initialTopicData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            const localFileButtonHandler = () => {
                                if (!localFileLoaded) {
                                    selectFile(openFileSelector, clear);
                                } else {
                                    try {
                                        const values = { ...formik.values };
                                        const gltfData = JSON.parse(localFileContent);
                                        values.gltfData = JSON.stringify(gltfData, null, 4);
                                        formik.setValues(values);
                                    } catch (e) {
                                        console.error(e);
                                        toast.error("Invalid gltffile");
                                        setLocalFileLabel("Select local file");
                                        setLocalFileContent("");
                                        setLocalFileLoaded(false);
                                        clear();
                                    }
                                }
                            }
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='input'
                                            label='Name'
                                            name='name'
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
                                            digitalTwinType === "Grafana dashboard" ?
                                                <FormikControl
                                                    control='input'
                                                    label='DashboardId'
                                                    name='dashboardId'
                                                    type='text'
                                                />

                                                :
                                                <>
                                                    <GltfDataFileTitle>Gltf data file</GltfDataFileTitle>
                                                    <GltfDataFileContainer>
                                                        <FormikControl
                                                            control='textarea'
                                                            label='Gltf data'
                                                            name='gltfData'
                                                            textAreaSize='Large'
                                                        />
                                                        <SelectGltfDataFilenButtonContainer >
                                                            <SelectFileButton
                                                                type='button'
                                                                onClick={() => localFileButtonHandler()}
                                                                onContextMenu={resetFileSelect}
                                                            >
                                                                {localFileLabel}
                                                            </SelectFileButton>
                                                        </SelectGltfDataFilenButtonContainer>
                                                    </GltfDataFileContainer>
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

export default EditDigitalTwin;