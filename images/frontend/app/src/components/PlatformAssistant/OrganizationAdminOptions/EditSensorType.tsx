import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { SENSOR_TYPES_OPTIONS } from '../Utils/platformAssistantOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import SvgComponent from '../../Tools/SvgComponent';
import { useFilePicker } from 'use-file-picker';
import {
    useSensorTypesDispatch,
    useSensorTypeIdToEdit,
    useSensorTypeRowIndexToEdit,
    setSensorTypesOptionToShow
} from '../../../contexts/sensorTypesOptions';
import { ISensorType } from '../TableColumns/sensorTypesColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 290px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 420px);
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


const SvgIconPreviewContainerDiv = styled.div`
    margin: 5px 0;
    width: 100%;
`;

const SvgIconPreviewTitle = styled.div`
    margin-bottom: 5px;
`;

const SvgComponentContainerDiv = styled.div`
    padding: 10px;
    border: 2px solid #2c3235;
    border-radius: 10px;
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
`;

const FileSelectionContainer = styled.div`
    width: 100%;
    margin-bottom: 15px;
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

const FieldContainer = styled.div`
    margin: 20px 0 10px 0;

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

const dashboardRefreshOptions = [
    {
        label: "200ms",
        value: "200ms"
    },
    {
        label: "1s",
        value: "1s"
    },
    {
        label: "5s",
        value: "5s"
    },
    {
        label: "10s",
        value: "10s"
    },
    {
        label: "30s",
        value: "30s"
    },
    {
        label: "1m",
        value: "1m"
    },
    {
        label: "5m",
        value: "5m"
    },
    {
        label: "15m",
        value: "15m"
    },
    {
        label: "30m",
        value: "30m"
    },
    {
        label: "1h",
        value: "1h"
    },
    {
        label: "2h",
        value: "2h"
    },
    {
        label: "1d",
        value: "1d"
    },
];

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();


interface EditSensorTypeProps {
    sensorTypes: ISensorType[];
    backToTable: () => void;
    refreshSensorTypes: () => void;
}

const EditSensorType: FC<EditSensorTypeProps> = ({
    sensorTypes,
    backToTable,
    refreshSensorTypes
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const sensorTypesDispatch = useSensorTypesDispatch();
    const sensorTypeId = useSensorTypeIdToEdit();
    const sensorTypeRowIndex = useSensorTypeRowIndexToEdit();
    const orgId = sensorTypes[sensorTypeRowIndex].orgId;
    const storedIconSvgString = sensorTypes[sensorTypeRowIndex].iconSvgString;
    const [iconSvgString, setIconSvgString] = useState(storedIconSvgString);
    const [iconSvgFileLoaded, setIconSvgFileLoaded] = useState(storedIconSvgString !== "");
    const storedIconSvgFileName = sensorTypes[sensorTypeRowIndex].iconSvgFileName;
    const [iconSvgFileName, setIconSvgFileName] = useState(storedIconSvgFileName);
    const storedMarkerSvgString = sensorTypes[sensorTypeRowIndex].markerSvgString;
    const [markerSvgString, setMarkerSvgString] = useState(storedMarkerSvgString);
    const [markerSvgFileLoaded, setMarkerSvgFileLoaded] = useState(storedMarkerSvgString !== "");
    const storedMarkerSvgFileName = sensorTypes[sensorTypeRowIndex].markerSvgFileName;
    const [markerSvgFileName, setMarkerSvgFileName] = useState(storedMarkerSvgFileName);

    const [openIconSvgFileSelector, iconSvgFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.svg',
    });

    const [openMarkerSvgFileSelector, markerSvgFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.svg',
    });

    useEffect(() => {
        if (
            !iconSvgFileParams.loading &&
            iconSvgFileParams.filesContent.length !== 0 &&
            iconSvgFileParams.plainFiles.length !== 0
        ) {
            setIconSvgFileLoaded(true)
            try {
                const sensorTypeSvgString = iconSvgFileParams.filesContent[0].content;
                setIconSvgString(sensorTypeSvgString);
                const iconSvgFileName = iconSvgFileParams.plainFiles[0].name;
                setIconSvgFileName(iconSvgFileName);
                iconSvgFileParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid svg file. ${error.message}`);
                } else {
                    toast.error("Invalid svg file");
                }
                setIconSvgFileLoaded(false);
                setIconSvgFileName("-");
                setIconSvgString("");
                iconSvgFileParams.clear();
            }
        }
    }, [
        iconSvgFileParams.loading,
        iconSvgFileParams.filesContent,
        iconSvgFileParams.plainFiles,
        iconSvgFileParams,
    ])

    useEffect(() => {
        if (
            !markerSvgFileParams.loading &&
            markerSvgFileParams.filesContent.length !== 0 &&
            markerSvgFileParams.plainFiles.length !== 0
        ) {
            setMarkerSvgFileLoaded(true)
            try {
                const markerSvgString = markerSvgFileParams.filesContent[0].content;
                setMarkerSvgString(markerSvgString);
                const markerSvgFileName = markerSvgFileParams.plainFiles[0].name;
                setMarkerSvgFileName(markerSvgFileName);
                markerSvgFileParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid marker svg file. ${error.message}`);
                } else {
                    toast.error("Invalid marker svg file");
                }
                setMarkerSvgFileLoaded(false);
                setMarkerSvgFileName("-");
                setMarkerSvgString("");
                markerSvgFileParams.clear();
            }
        }
    }, [
        markerSvgFileParams.loading,
        markerSvgFileParams.filesContent,
        markerSvgFileParams.plainFiles,
        markerSvgFileParams,
    ])

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/sensor_type/${orgId}/id/${sensorTypeId}`;
        const config = axiosAuth(accessToken);

        const sensorTypeData = {
            type: values.type,
            iconSvgFileName,
            markerSvgFileName,
            markerSvgString,
            iconSvgString,
            dashboardRefreshString: values.dashboardRefresh,
            dashboardTimeWindow: values.dashboardTimeWindow,
            defaultPayloadJsonSchema: values.defaultPayloadJsonSchema
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, sensorTypeData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const sensorTypesOptionToShow = { sensorTypesOptionToShow: SENSOR_TYPES_OPTIONS.TABLE };
                setIsSubmitting(false);
                setSensorTypesOptionToShow(sensorTypesDispatch, sensorTypesOptionToShow);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshSensorTypes();
            })
    }

    const initialSensorTypeData = {
        type: sensorTypes[sensorTypeRowIndex].type,
        dashboardRefresh: sensorTypes[sensorTypeRowIndex].dashboardRefreshString,
        dashboardTimeWindow: sensorTypes[sensorTypeRowIndex].dashboardTimeWindow,
        defaultPayloadJsonSchema: JSON.stringify(sensorTypes[sensorTypeRowIndex].defaultPayloadJsonSchema, null, 4),
    }

    const validationSchema = Yup.object().shape({
        type: Yup.string().max(40, "The maximum number of characters allowed is 40").required('Required'),
        dashboardTimeWindow: Yup.string().matches(/\d+(s|m|h)$/,
            "Dashboard time window must contain a number follow by 's', 'm' or 'h'"
        ).required('Required'),
        defaultPayloadJsonSchema: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const iconSvgFileButtonHandler = () => {
        if (!iconSvgFileLoaded) {
            selectFile(openIconSvgFileSelector, iconSvgFileParams.clear);
        }
    }

    const clearIconSvgDataFile = () => {
        setIconSvgFileLoaded(false);
        setIconSvgFileName("-");
        setIconSvgString("");
        iconSvgFileParams.clear();
    }

    const markerSvgFileButtonHandler = () => {
        if (!markerSvgFileLoaded) {
            selectFile(openMarkerSvgFileSelector, markerSvgFileParams.clear);
        }
    }

    const clearMarkerSvgDataFile = () => {
        setMarkerSvgFileLoaded(false);
        setMarkerSvgFileName("-");
        setMarkerSvgString("");
        markerSvgFileParams.clear();
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Edit sensor type</FormTitle>
            <FormContainer>
                <Formik initialValues={initialSensorTypeData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='Type'
                                        name='type'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Dashboard refresh time'
                                        name="dashboardRefresh"
                                        options={dashboardRefreshOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Dashboard time window'
                                        name='dashboardTimeWindow'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='textarea'
                                        label='Default payload json schema'
                                        name='defaultPayloadJsonSchema'
                                        textAreaSize='Small'
                                    />
                                    <DataFileTitle>Select icon svg file</DataFileTitle>
                                    <FileSelectionContainer>
                                        <DataFileContainer>
                                            {
                                                iconSvgFileLoaded &&
                                                <SvgIconPreviewContainerDiv>
                                                    <SvgIconPreviewTitle>
                                                        Icon preview
                                                    </SvgIconPreviewTitle>
                                                    <SvgComponentContainerDiv>
                                                        <SvgComponent
                                                            svgString={iconSvgString}
                                                            imgWidth="100"
                                                            imgHeight="100"
                                                            backgroundColor="#202226"
                                                        />
                                                    </SvgComponentContainerDiv>
                                                </SvgIconPreviewContainerDiv>
                                            }
                                            <FieldContainer>
                                                <label>File name</label>
                                                <div>{iconSvgFileName}</div>
                                            </FieldContainer>
                                            <SelectDataFilenButtonContainer >
                                                <FileButton
                                                    type='button'
                                                    onClick={clearIconSvgDataFile}
                                                >
                                                    Clear
                                                </FileButton>
                                                <FileButton
                                                    type='button'
                                                    onClick={() => iconSvgFileButtonHandler()}
                                                >
                                                    Select local file
                                                </FileButton>
                                            </SelectDataFilenButtonContainer>
                                        </DataFileContainer>
                                    </FileSelectionContainer>
                                    <DataFileTitle>Select marker svg file</DataFileTitle>
                                    <FileSelectionContainer>
                                        <DataFileContainer>
                                            {
                                                markerSvgFileLoaded &&
                                                <SvgIconPreviewContainerDiv>
                                                    <SvgIconPreviewTitle>
                                                        Marker preview
                                                    </SvgIconPreviewTitle>
                                                    <SvgComponentContainerDiv>
                                                        <SvgComponent
                                                            svgString={markerSvgString}
                                                            imgWidth="100"
                                                            imgHeight="100"
                                                            backgroundColor="#202226"
                                                        />
                                                    </SvgComponentContainerDiv>
                                                </SvgIconPreviewContainerDiv>
                                            }
                                            <FieldContainer>
                                                <label>File name</label>
                                                <div>{markerSvgFileName}</div>
                                            </FieldContainer>
                                            <SelectDataFilenButtonContainer >
                                                <FileButton
                                                    type='button'
                                                    onClick={clearMarkerSvgDataFile}
                                                >
                                                    Clear
                                                </FileButton>
                                                <FileButton
                                                    type='button'
                                                    onClick={() => markerSvgFileButtonHandler()}
                                                >
                                                    Select local file
                                                </FileButton>
                                            </SelectDataFilenButtonContainer>
                                        </DataFileContainer>
                                    </FileSelectionContainer>
                                </ControlsContainer>
                                <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default EditSensorType;