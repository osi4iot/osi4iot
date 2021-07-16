import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import axios from "axios";
import { axiosAuth, getDomainName } from "../../tools/tools";
import { useAuthState } from "../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../Tools/FormikControl";
import FormButtonsProps from "../Tools/FormButtons";
import FormTitle from "../Tools/FormTitle";
import { BUILDINGS_OPTIONS } from './platformAssistantOptions';
import { IBuilding } from './TableColumns/buildingsColumns';
import {
    useBuildingIdToEdit,
    useBuildingRowIndexToEdit,
    useBuildingsDispatch,
    setBuildingsOptionToShow
} from '../../contexts/buildingsOptions';
import geojsonValidation from '../../tools/geojsonValidation';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
`;

const ControlsContainer = styled.div`
    width: 100%;

    div:first-child {
        margin-top: 0;
    }
`;



const domainName = getDomainName();

interface EditBuildingProps {
    buildings: IBuilding[];
    backToTable: () => void;
    refreshBuildings: () => void;
}

const EditBuilding: FC<EditBuildingProps> = ({ buildings, backToTable, refreshBuildings }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken } = useAuthState();
    const buildingsDispatch = useBuildingsDispatch();
    const buildingId = useBuildingIdToEdit();
    const buildingRowIndex = useBuildingRowIndexToEdit();

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/building/${buildingId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }
        
        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        values.geoJsonData = JSON.stringify(JSON.parse(values.geoJsonData));

        axios
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
                toast.error(errorMessage);
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
                        formik => (
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
                                    />
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

export default EditBuilding;