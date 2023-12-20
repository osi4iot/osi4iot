import { FC, useState, SyntheticEvent, useEffect } from 'react';
import { FeatureCollection } from 'geojson';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { FLOORS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setFloorsOptionToShow, useFloorsDispatch } from '../../../contexts/floorsOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import formatDateString from '../../../tools/formatDate';
import { isGeoJSONString } from '../../../tools/geojsonValidation';
import { IBuilding } from '../TableColumns/buildingsColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 500px);
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
`;

const FloorLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const FloorLocationContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
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
    margin-bottom: 10px;
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

interface IFloorInputData {
    buildingName: string;
    floorNumber: number;
}

type FormikType = FormikProps<IFloorInputData>

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();

interface CreateFloorProps {
    buildingsTable: IBuilding[];
    backToTable: () => void;
    refreshFloors: () => void;
}

const CreateFloor: FC<CreateFloorProps> = ({ buildingsTable, backToTable, refreshFloors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const floorsDispatch = useFloorsDispatch();
    const [floorGeoData, setFloorGeoData] = useState({});
    const [floorFileLoaded, setFloorFileLoaded] = useState(false);
    const [floorFileName, setFloorFileName] = useState("-");
    const [floorFileLastModifDate, setFloorFileLastModifDate] = useState("-");
    const [isFloorDataReady, setIsFloorDataReady] = useState(false);
    const initialBuilding = buildingsTable[0];
    const [buildingOptions, setBuildingOptions] = useState<IOption[]>([]);

    useEffect(() => {
        const buildingNameArray = buildingsTable.map(building => building.name);
        setBuildingOptions(convertArrayToOptions(buildingNameArray));
    }, [
        buildingsTable
    ]);

    const handleChangeBuilding = (e: { value: string }, formik: FormikType) => {
        const buildingName = e.value;
        formik.setFieldValue("buildingName", buildingName);
    }

    const [openFloorFileSelector, floorFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.geojson',
    });

    useEffect(() => {
        if (
            !floorFileParams.loading &&
            floorFileParams.filesContent.length !== 0 &&
            floorFileParams.plainFiles.length !== 0
        ) {
            setFloorFileLoaded(true)
            try {
                const fileContent = floorFileParams.filesContent[0].content;
                const errorArray = isGeoJSONString(fileContent, true);
                if (Array.isArray(errorArray) && errorArray.length !== 0) {
                    throw new Error(errorArray.join(", "));
                }
                const floorGeoData = JSON.parse(fileContent);
                setFloorGeoData(floorGeoData);
                const floorFileName = floorFileParams.plainFiles[0].name;
                setFloorFileName(floorFileName);
                const dateString = (floorFileParams.plainFiles[0] as any).lastModified;
                setFloorFileLastModifDate(formatDateString(dateString));
                setFloorFileLoaded(false);
                floorFileParams.clear();
                setIsFloorDataReady(true);

            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid geojson file. ${error.message}`);
                } else {
                    toast.error("Invalid geojson file");
                }
                setFloorFileLoaded(false);
                setFloorFileName("-");
                setFloorGeoData({} as FeatureCollection);
                setFloorFileLastModifDate("-");
                setIsFloorDataReady(false);
                floorFileParams.clear();
            }
        }
    }, [
        floorFileParams.loading,
        floorFileParams.filesContent,
        floorFileParams.plainFiles,
        floorFileParams,
    ])

    const clearFloorDataFile = () => {
        setFloorFileName("-");
        setFloorFileLastModifDate("-");
        setFloorGeoData({});
        setFloorFileLoaded(false);
        floorFileParams.clear();
    }

    const floorFileButtonHandler = async () => {
        if (!floorFileLoaded) {
            selectFile(openFloorFileSelector, floorFileParams.clear);
        }
    }

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/building_floor`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).buildingId === 'string') {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        const buildingName = values.buildingName;
        const buildingId = buildingsTable.filter(building => building.name === buildingName)[0].id;

        const floorData = {
            buildingId,
            floorNumber: values.floorNumber,
            geoJsonData: JSON.stringify(floorGeoData),
            floorFileName,
            floorFileLastModifDate,
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, floorData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const floorsOptionToShow = { floorsOptionToShow: FLOORS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setFloorsOptionToShow(floorsDispatch, floorsOptionToShow);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshFloors();
            })
    }


    const initialFloorData = {
        buildingName: initialBuilding.name,
        floorNumber: 0,
    }

    const validationSchema = Yup.object().shape({
        floorNumber: Yup.number().integer().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create floor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialFloorData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='select'
                                            label='Select building'
                                            name='buildingName'
                                            type='text'
                                            options={buildingOptions}
                                            onChange={(e) => handleChangeBuilding(e, formik)}
                                        />
                                        <FloorLocationTitle>Floor location</FloorLocationTitle>
                                        <FloorLocationContainer>
                                            <FormikControl
                                                control='input'
                                                label='Floor number'
                                                name='floorNumber'
                                                type='text'
                                            />
                                            <DataFileTitle>Geojson file</DataFileTitle>
                                            <DataFileContainer>
                                                <FieldContainer>
                                                    <label>File name</label>
                                                    <div>{floorFileName}</div>
                                                </FieldContainer>
                                                <FieldContainer>
                                                    <label>Last modification date</label>
                                                    <div>{floorFileLastModifDate}</div>
                                                </FieldContainer>
                                                <SelectDataFilenButtonContainer >
                                                    <FileButton
                                                        type='button'
                                                        onClick={clearFloorDataFile}
                                                    >
                                                        Clear
                                                    </FileButton>
                                                    <FileButton
                                                        type='button'
                                                        onClick={() => floorFileButtonHandler()}
                                                    >
                                                        Select local file
                                                    </FileButton>
                                                </SelectDataFilenButtonContainer>
                                            </DataFileContainer>
                                        </FloorLocationContainer>
                                    </ControlsContainer>
                                    <FormButtonsProps
                                        onCancel={onCancel}
                                        isValid={formik.isValid && isFloorDataReady}
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

export default CreateFloor;