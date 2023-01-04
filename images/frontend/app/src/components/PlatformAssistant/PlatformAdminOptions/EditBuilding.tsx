import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import centerOfMass from '@turf/center-of-mass';
import { polygon } from '@turf/helpers';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
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
import geojsonValidation from '../../../tools/geojsonValidation';



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

const SelectBuildingLocationButtonContainer = styled.div`
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
    const [localFileContent, setLocalFileContent] = useState("");
    const [localFileLoaded, setLocalFileLoaded] = useState(false);
    const [localFileLabel, setLocalFileLabel] = useState("Select local file");

    const [openFileSelector, { filesContent, plainFiles, loading, clear }] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.geojson',
    });

    useEffect(() => {
        if (!loading && filesContent.length !== 0 && plainFiles.length !== 0) {
            setLocalFileContent(filesContent[0].content);
            setLocalFileLoaded(true)
            setLocalFileLabel(`Add geodata from ${plainFiles[0].name} file`);
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
        const url = `${protocol}://${domainName}/admin_api/building/${buildingId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }

        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        values.geoJsonData = JSON.stringify(JSON.parse(values.geoJsonData));

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const buildingsOptionToShow = { buildingsOptionToShow: BUILDINGS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setBuildingsOptionToShow(buildingsDispatch, buildingsOptionToShow);
                refreshBuildings();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if(errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }

    const initialDeviceData = {
        name: buildings[buildingRowIndex].name,
        longitude: buildings[buildingRowIndex].longitude,
        latitude: buildings[buildingRowIndex].latitude,
        geoJsonData: JSON.stringify(buildings[buildingRowIndex].geoJsonData, null, 4)
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        geoJsonData: Yup.string().test(`test-geojson`, '', geojsonValidation).required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit building</FormTitle>
            <FormContainer>
                <Formik initialValues={initialDeviceData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            const localFileButtonHandler = () => {
                                if (!localFileLoaded) {
                                    selectFile(openFileSelector, clear);
                                } else {
                                    try {
                                        const values = { ...formik.values };
                                        const geojsonObj = JSON.parse(localFileContent);
                                        values.geoJsonData = JSON.stringify(geojsonObj, null, 4);
                                        let geoPolygon;
                                        if (geojsonObj.features[0].geometry.type === "Polygon") {
                                            geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
                                        } else if (geojsonObj.features[0].geometry.type === "MultiPolygon") {
                                            geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates[0]);
                                        }
                                        const center = centerOfMass(geoPolygon);
                                        values.longitude = center.geometry.coordinates[0];
                                        values.latitude = center.geometry.coordinates[1];
                                        formik.setValues(values);
                                    } catch (e) {
                                        console.log(e);
                                        toast.error("Invalid geojson file");
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
                                            label='Building name'
                                            name='name'
                                            type='text'
                                        />
                                        <BuildingLocationTitle>Building location</BuildingLocationTitle>
                                        <BuildingLocationContainer>
                                            <FormikControl
                                                control='input'
                                                label='Longitude'
                                                name='longitude'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='input'
                                                label='Latitude'
                                                name='latitude'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='textarea'
                                                label='Geojson data'
                                                name='geoJsonData'
                                                textAreaSize='Small'
                                            />
                                            <SelectBuildingLocationButtonContainer >
                                                <SelectFileButton
                                                    type='button'
                                                    onClick={() => localFileButtonHandler()}
                                                    onContextMenu={resetFileSelect}
                                                >
                                                    {localFileLabel}
                                                </SelectFileButton>
                                            </SelectBuildingLocationButtonContainer>
                                        </BuildingLocationContainer>
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

export default EditBuilding;