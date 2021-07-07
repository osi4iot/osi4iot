import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../Tools/FormikControl";
import FormButtonsProps from "../Tools/FormButtons";
import FormTitle from "../Tools/FormTitle";
import { BUILDINGS_OPTIONS } from './platformAssistantOptions';
import { setBuildingsOptionToShow, useBuildingsDispatch } from '../../contexts/buildingsOptions';


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

interface CreateBuildingProps {
    backToTable: () => void;
    refreshBuildings: () => void;
}

const CreateBuilding: FC<CreateBuildingProps> = ({ backToTable, refreshBuildings }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const buildingsDispatch = useBuildingsDispatch();

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/building`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }
        
        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        const buildingData = {
            name: values.name,
            longitude: values.longitude,
            latitude: values.latitude,
            geoJsonData: values.geoJsonData
        }

        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .post(url, buildingData, config)
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


    const initialBuildingData = {
        name: "",
        longitude: 0,
        latitude: 0,
        geoJsonData: "{}"
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        geoJsonData: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create building</FormTitle>
            <FormContainer>
                <Formik initialValues={initialBuildingData} validationSchema={validationSchema} onSubmit={onSubmit} >
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

export default CreateBuilding;