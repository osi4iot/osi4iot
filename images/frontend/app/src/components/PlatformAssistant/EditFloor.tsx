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
import { FLOORS_OPTIONS } from './platformAssistantOptions';
import { IFloor } from './TableColumns/floorsColumns';
import { useFloorIdToEdit, useFloorRowIndexToEdit, useFloorsDispatch, setFloorsOptionToShow } from '../../contexts/floorsOptions';


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

interface EditFloorProps {
    floors: IFloor[];
    backToTable: () => void;
    refreshFloors: () => void;
}

const EditFloor: FC<EditFloorProps> = ({ floors, backToTable, refreshFloors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken } = useAuthState();
    const floorsDispatch = useFloorsDispatch();
    const floorId = useFloorIdToEdit();
    const floorRowIndex = useFloorRowIndexToEdit();

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/building_floor/${floorId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        if (typeof (values as any).buildingId === 'string') {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        axios
            .patch(url, values, config)
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

    const initialDeviceData = {
        buildingId: floors[floorRowIndex].buildingId,
        floorNumber: floors[floorRowIndex].floorNumber,
        geoJsonData: JSON.stringify(floors[floorRowIndex].geoJsonData)
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
            <FormTitle isSubmitting={isSubmitting} >Edit floor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialDeviceData} validationSchema={validationSchema} onSubmit={onSubmit} >
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

export default EditFloor;