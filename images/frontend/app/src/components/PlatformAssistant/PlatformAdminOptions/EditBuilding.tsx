import { FC, useState, SyntheticEvent, useEffect } from 'react';
import { FeatureCollection } from 'geojson';
import styled from "styled-components";
import centerOfMass from '@turf/center-of-mass';
import { polygon } from '@turf/helpers';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { BUILDINGS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IBuilding } from '../TableColumns/buildingsColumns';
import {
    useBuildingIdToEdit,
    useBuildingRowIndexToEdit,
    useBuildingsDispatch,
    setBuildingsOptionToShow
} from '../../../contexts/buildingsOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import formatDateString from '../../../tools/formatDate';
import { isGeoJSONString } from '../../../tools/geojsonValidation';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
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
`;

const BuildingLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const BuildingLocationContainer = styled.div`
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

const domainName = getDomainName();
const protocol = getProtocol();

interface EditBuildingProps {
    buildings: IBuilding[];
    backToTable: () => void;
    refreshBuildings: () => void;
}

const EditBuilding: FC<EditBuildingProps> = ({ buildings, backToTable, refreshBuildings }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const buildingsDispatch = useBuildingsDispatch();
    const buildingId = useBuildingIdToEdit();
    const buildingRowIndex = useBuildingRowIndexToEdit();
    const storedGeoJsonData = buildings[buildingRowIndex].geoJsonData;
    const [buildingGeoData, setBuildingGeoData] = useState(storedGeoJsonData);
    const [buildingFileLoaded, setBuildingFileLoaded] = useState(false);
    const storedBuildingFileName = buildings[buildingRowIndex].buildingFileName || "-";
    const [buildingFileName, setBuildingFileName] = useState(storedBuildingFileName);
    const storedBuildingFileLastModifDate = buildings[buildingRowIndex].buildingFileLastModifDate || "-";
    const [buildingFileLastModifDate, setBuildingFileLastModifDate] = useState(storedBuildingFileLastModifDate);
    const [longitude, setLongitude] = useState(buildings[buildingRowIndex].longitude);
    const [latitude, setLatitude] = useState(buildings[buildingRowIndex].latitude);
    const [isBuildingDataReady, setIsBuildingDataReady] = useState(Object.keys(storedGeoJsonData).length !== 0);

    const [openBuildingFileSelector, buildingFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.geojson',
    });

    useEffect(() => {
        if (
            !buildingFileParams.loading &&
            buildingFileParams.filesContent.length !== 0 &&
            buildingFileParams.plainFiles.length !== 0
        ) {
            setBuildingFileLoaded(true)
            try {
                const fileContent = buildingFileParams.filesContent[0].content;
                const errorArray = isGeoJSONString(fileContent, true);
                if (Array.isArray(errorArray) && errorArray.length !== 0) {
                    throw new Error(errorArray.join(", "));
                }
                const buildingGeoData = JSON.parse(fileContent);
                setBuildingGeoData(buildingGeoData);
                const buildingFileName = buildingFileParams.plainFiles[0].name;
                setBuildingFileName(buildingFileName);
                const dateString = (buildingFileParams.plainFiles[0] as any).lastModified;
                setBuildingFileLastModifDate(formatDateString(dateString));
                setBuildingFileLoaded(false);
                buildingFileParams.clear();
                setIsBuildingDataReady(true);

                let geoPolygon;
                if (buildingGeoData.features[0].geometry.type === "Polygon") {
                    geoPolygon = polygon(buildingGeoData.features[0].geometry.coordinates);
                } else if (buildingGeoData.features[0].geometry.type === "MultiPolygon") {
                    geoPolygon = polygon(buildingGeoData.features[0].geometry.coordinates[0]);
                }
                const center = centerOfMass(geoPolygon);
                setLongitude(center.geometry.coordinates[0]);
                setLatitude(center.geometry.coordinates[1]);

            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid geojson file. ${error.message}`);
                } else {
                    toast.error("Invalid geojson file");
                }
                setBuildingFileLoaded(false);
                setBuildingFileName("-");
                setBuildingGeoData({} as FeatureCollection);
                setBuildingFileLastModifDate("-");
                setIsBuildingDataReady(false);
                buildingFileParams.clear();
            }
        }
    }, [
        buildingFileParams.loading,
        buildingFileParams.filesContent,
        buildingFileParams.plainFiles,
        buildingFileParams,
    ])

    const clearBuildingDataFile = () => {
        setBuildingFileName("-");
        setBuildingFileLastModifDate("-");
        setBuildingGeoData({} as FeatureCollection);
        setBuildingFileLoaded(false);
        buildingFileParams.clear();
    }

    const buildingFileButtonHandler = async () => {
        if (!buildingFileLoaded) {
            selectFile(openBuildingFileSelector, buildingFileParams.clear);
        }
    }

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/building/${buildingId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const buildingData = {
            name: values.name,
            address: values.address,
            city: values.city,
            zipCode: values.zipCode,
            state: values.state,
            country: values.country,
            longitude,
            latitude,
            geoJsonData: JSON.stringify(buildingGeoData),
            buildingFileName,
            buildingFileLastModifDate,
        }

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, buildingData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const buildingsOptionToShow = { buildingsOptionToShow: BUILDINGS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setBuildingsOptionToShow(buildingsDispatch, buildingsOptionToShow);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshBuildings();
            })
    }

    const initialBuildingData = {
        name: buildings[buildingRowIndex].name,
        longitude: buildings[buildingRowIndex].longitude,
        latitude: buildings[buildingRowIndex].latitude,
        address: buildings[buildingRowIndex].address,
        city: buildings[buildingRowIndex].city,
        zipCode: buildings[buildingRowIndex].zipCode,
        state: buildings[buildingRowIndex].state,
        country: buildings[buildingRowIndex].country,
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        address: Yup.string().max(255, "The maximum number of characters allowed is 255").required('Required'),
        city: Yup.string().max(255, "The maximum number of characters allowed is 255").required('Required'),
        zipCode: Yup.string().max(50, "The maximum number of characters allowed is 50").required('Required'),
        state: Yup.string().max(255, "The maximum number of characters allowed is 255").required('Required'),
        country: Yup.string().max(255, "The maximum number of characters allowed is 255").required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit building</FormTitle>
            <FormContainer>
                <Formik initialValues={initialBuildingData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='input'
                                            label='Building name'
                                            name='name'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Address'
                                            name='address'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='City'
                                            name='city'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Zip code'
                                            name='zipCode'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='State'
                                            name='state'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Country'
                                            name='country'
                                            type='text'
                                        />
                                        <BuildingLocationTitle>Building location</BuildingLocationTitle>
                                        <BuildingLocationContainer>
                                            <FieldContainer>
                                                <label>Longitude</label>
                                                <div>{longitude}</div>
                                            </FieldContainer>
                                            <FieldContainer>
                                                <label>Latitude</label>
                                                <div>{latitude}</div>
                                            </FieldContainer>
                                            <DataFileTitle>Geojson file</DataFileTitle>
                                            <DataFileContainer>
                                                <FieldContainer>
                                                    <label>File name</label>
                                                    <div>{buildingFileName}</div>
                                                </FieldContainer>
                                                <FieldContainer>
                                                    <label>Last modification date</label>
                                                    <div>{buildingFileLastModifDate}</div>
                                                </FieldContainer>
                                                <SelectDataFilenButtonContainer >
                                                    <FileButton
                                                        type='button'
                                                        onClick={clearBuildingDataFile}
                                                    >
                                                        Clear
                                                    </FileButton>
                                                    <FileButton
                                                        type='button'
                                                        onClick={() => buildingFileButtonHandler()}
                                                    >
                                                        Select local file
                                                    </FileButton>
                                                </SelectDataFilenButtonContainer>
                                            </DataFileContainer>
                                        </BuildingLocationContainer>
                                    </ControlsContainer>
                                    <FormButtonsProps
                                        onCancel={onCancel}
                                        isValid={formik.isValid && isBuildingDataReady}
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

export default EditBuilding;