import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { ASSET_TYPES_OPTIONS } from '../Utils/platformAssistantOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import SvgComponent from '../../Tools/SvgComponent';
import { useFilePicker } from 'use-file-picker';
import { setAssetTypesOptionToShow, useAssetTypesDispatch } from '../../../contexts/assetTypesOptions';
import { IOrgManaged } from '../TableColumns/organizationsManagedColumns';
import { ControlsContainer, FormContainer } from '../GroupAdminOptions/CreateAsset';
import { generateAssetTypeMarker, cleanSvgString } from '../../../tools/generateAssetTypeMarker';
import { AxiosResponse, AxiosError } from 'axios';

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

const geolocationModeOptions = [
    {
        label: "Static",
        value: "static"
    },
    {
        label: "Dynamic",
        value: "dynamic"
    }
];

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();


interface IFormikValues {
    orgAcronym: string;
    type: string;
    geolocationMode: string;
    assetStateFormat: string;
}

type FormikType = FormikProps<IFormikValues>

interface CreateAssetTypeProps {
    orgsManagedTable: IOrgManaged[];
    backToTable: () => void;
    refreshAssetTypes: () => void;
}

const CreateAssetType: FC<CreateAssetTypeProps> = ({
    orgsManagedTable,
    backToTable,
    refreshAssetTypes
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const assetTypesDispatch = useAssetTypesDispatch();
    const [geolocationMode, setGeolocationMode] = useState("static");
    const [iconSvgString, setIconSvgString] = useState("");
    const [iconSvgFileLoaded, setIconSvgFileLoaded] = useState(false);
    const [iconSvgFileName, setIconSvgFileName] = useState("-");
    const [markerSvgString, setMarkerSvgString] = useState("");
    const [markerSvgFileLoaded, setMarkerSvgFileLoaded] = useState(false);
    const [generateMarker, setGenerateMarker] = useState(false);
    const [markerSvgFileName, setMarkerSvgFileName] = useState("-");
    const initialOrg = orgsManagedTable[0];
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);

    useEffect(() => {
        const orgArray = orgsManagedTable.map(org => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
    }, [
        orgsManagedTable
    ]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
    }

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
                const assetSvgString = iconSvgFileParams.filesContent[0].content;
                const newAssetSvgString = cleanSvgString(assetSvgString);
                setIconSvgString(newAssetSvgString);
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
                const newMarkerSvgString = cleanSvgString(markerSvgString);
                setMarkerSvgString(newMarkerSvgString);
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

    useEffect(() => {
        if (
            generateMarker &&
            geolocationMode === "dynamic" &&
            iconSvgFileName !== "-" &&
            iconSvgString !== "" &&
            markerSvgFileName === "-" &&
            markerSvgString === ""
        ) {
            const newMarkerSvgFileName = `marker_${iconSvgFileName}`;
            setMarkerSvgFileName(newMarkerSvgFileName);
            const newMarkerSvgString = generateAssetTypeMarker(iconSvgString);
            setMarkerSvgString(newMarkerSvgString);
            setMarkerSvgFileLoaded(true);
            setGenerateMarker(false);
        }
    }, [
        generateMarker,
        geolocationMode,
        iconSvgFileName,
        iconSvgString,
        markerSvgFileName,
        markerSvgString,
    ]);


    const onSubmit = (values: any, actions: any) => {
        const orgAcronym = values.orgAcronym;
        const orgId = orgsManagedTable.filter(org => org.acronym === orgAcronym)[0].id;
        const url = `${protocol}://${domainName}/admin_api/asset_type/${orgId}`;
        const config = axiosAuth(accessToken);
        const geolocationMode = values.geolocationMode;

        const assetTypeData = {
            type: values.type,
            iconSvgFileName,
            iconSvgString,
            geolocationMode,
            markerSvgFileName,
            markerSvgString,
            assetStateFormat: values.assetStateFormat
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, assetTypeData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const assetTypesOptionToShow = { assetTypesOptionToShow: ASSET_TYPES_OPTIONS.TABLE };
                setIsSubmitting(false);
                setAssetTypesOptionToShow(assetTypesDispatch, assetTypesOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshAssetTypes();
            })
    }

    const initialAssetTypeData = {
        orgAcronym: initialOrg.acronym,
        type: "",
        geolocationMode: "static",
        assetStateFormat: "{}"
    }

    const validationSchema = Yup.object().shape({
        type: Yup.string().max(40, "The maximum number of characters allowed is 40").required('Required'),
        assetStateFormat: Yup.string().required('Required'),
    });

    const onGeolocationModeSelectChange = (e: { value: string }, formik: FormikType) => {
        setGeolocationMode(e.value);
        formik.setFieldValue("geolocationMode", e.value);
        if(e.value === "dynamic") setGenerateMarker(true);
    }

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
            <FormTitle isSubmitting={isSubmitting}>Create asset type</FormTitle>
            <FormContainer>
                <Formik initialValues={initialAssetTypeData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
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
                                        control='input'
                                        label='Type'
                                        name='type'
                                        type='text'
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
                                    <FormikControl
                                        control='select'
                                        label='Geolocation mode'
                                        name='geolocationMode'
                                        options={geolocationModeOptions}
                                        type='text'
                                        onChange={(e) => onGeolocationModeSelectChange(e, formik)}
                                    />
                                    {
                                        geolocationMode === "dynamic" &&
                                        <>
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
                                                                    backgroundColor="#2A81CB"
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
                                        </>
                                    }
                                    <FormikControl
                                        control='textarea'
                                        label='Asset state json format'
                                        name='assetStateFormat'
                                        textAreaSize='Small'
                                    />
                                </ControlsContainer>
                                <FormButtonsProps
                                    onCancel={onCancel}
                                    isValid={formik.isValid}
                                    isSubmitting={formik.isSubmitting}
                                />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default CreateAssetType;