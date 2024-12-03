import { FC, useState, SyntheticEvent, useEffect } from 'react';
import { FeatureCollection } from 'geojson';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { FLOORS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IFloor } from '../TableColumns/floorsColumns';
import {
    useFloorIdToEdit,
    useFloorRowIndexToEdit,
    useFloorsDispatch,
    setFloorsOptionToShow
} from '../../../contexts/floorsOptions';
import { isGeoJSONString } from '../../../tools/geojsonValidation';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import formatDateString from '../../../tools/formatDate';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { AxiosResponse, AxiosError } from 'axios';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 510px);
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

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();

interface EditFloorProps {
    buildingsTable: IBuilding[];
    floors: IFloor[];
    backToTable: () => void;
    refreshFloors: () => void;
}

const EditFloor: FC<EditFloorProps> = ({ buildingsTable, floors, backToTable, refreshFloors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const floorsDispatch = useFloorsDispatch();
    const floorId = useFloorIdToEdit();
    const floorRowIndex = useFloorRowIndexToEdit();
    const buildingId = floors[floorRowIndex].buildingId;
    const buildingName = buildingsTable.filter(building => building.id === buildingId)[0].name;

    const storedGeoJsonData = floors[floorRowIndex].geoJsonData;
    const [floorGeoData, setFloorGeoData] = useState(storedGeoJsonData);
    const [floorFileLoaded, setFloorFileLoaded] = useState(false);
    const storedFloorFileName = floors[floorRowIndex].floorFileName || "-";
    const [floorFileName, setFloorFileName] = useState(storedFloorFileName);
    const storedFloorFileLastModifDate = floors[floorRowIndex].floorFileLastModifDate || "-";
    const [floorFileLastModifDate, setFloorFileLastModifDate] = useState(storedFloorFileLastModifDate);
    const [isFloorDataReady, setIsFloorDataReady] = useState(Object.keys(storedGeoJsonData).length !== 0);

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
        setFloorGeoData({} as FeatureCollection);
        setFloorFileLoaded(false);
        floorFileParams.clear();
    }

    const floorFileButtonHandler = async () => {
        if (!floorFileLoaded) {
            selectFile(openFloorFileSelector, floorFileParams.clear);
        }
    }

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/building_floor/${floorId}`;
        const config = axiosAuth(accessToken);

        setIsSubmitting(true);
        const building = buildingsTable.filter(building => building.name === buildingName)[0];
        let buildingId = building.id;

        if (typeof buildingId === 'string') {
            buildingId = parseInt((values as any).buildingId, 10);
        }

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        const floorData = {
            buildingId,
            floorNumber: values.floorNumber,
            geoJsonData: JSON.stringify(floorGeoData),
            floorFileName,
            floorFileLastModifDate,
        }

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, floorData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const floorsOptionToShow = { floorsOptionToShow: FLOORS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setFloorsOptionToShow(floorsDispatch, floorsOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshFloors();
            })
    }

    const initialFloorData = {
        buildingId: floors[floorRowIndex].buildingId,
        floorNumber: floors[floorRowIndex].floorNumber,
    }

    const validationSchema = Yup.object().shape({
        buildingId: Yup.number().integer().positive().required('Required'),
        floorNumber: Yup.number().integer().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit floor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialFloorData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FieldContainer>
                                            <label>Building name</label>
                                            <div>{buildingName}</div>
                                        </FieldContainer>
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

export default EditFloor;