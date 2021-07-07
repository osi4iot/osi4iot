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
import { FLOORS_OPTIONS } from './platformAssistantOptions';
import { setFloorsOptionToShow, useFloorsDispatch } from '../../contexts/floorsOptions';


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

interface CreateFloorProps {
    backToTable: () => void;
    refreshFloors: () => void;
}

const CreateFloor: FC<CreateFloorProps> = ({ backToTable, refreshFloors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const floorsDispatch = useFloorsDispatch();

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/building_floor`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).buildingId === 'string') {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        const floorData = {
            buildingId: values.buildingId,
            floorNumber: values.floorNumber,
            geoJsonData: values.geoJsonData
        }

        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .post(url, floorData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const floorsOptionToShow = { floorsOptionToShow: FLOORS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setFloorsOptionToShow(floorsDispatch, floorsOptionToShow);
                refreshFloors();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }


    const initialFloorData = {
        buildingId: 1,
        floorNumber: 0,
        geoJsonData: "{}"
    }

    const validationSchema = Yup.object().shape({
        buildingId: Yup.number().integer().positive().required('Required'),
        floorNumber: Yup.number().integer().required('Required'),
        geoJsonData: Yup.string().required('Required'),
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
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='Building Id'
                                        name='buildingId'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Floor number'
                                        name='floorNumber'
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

export default CreateFloor;