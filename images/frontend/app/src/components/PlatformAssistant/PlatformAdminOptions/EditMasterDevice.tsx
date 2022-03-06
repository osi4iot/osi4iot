import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { MASTER_DEVICES_OPTIONS } from '../Utils/platformAssistantOptions';
import { IMasterDevice } from '../TableColumns/masterDevicesColumns';
import { setMasterDevicesOptionToShow, useMasterDeviceIdToEdit, useMasterDeviceRowIndexToEdit, useMasterDevicesDispatch } from '../../../contexts/masterDevicesOptions';


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

const domainName = getDomainName();

interface EditMasterDeviceProps {
    masterDevices: IMasterDevice[];
    backToTable: () => void;
    refreshMasterDevices: () => void;
}

const EditMasterDevice: FC<EditMasterDeviceProps> = ({ masterDevices, backToTable, refreshMasterDevices }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const masterDevicesDispatch = useMasterDevicesDispatch();
    const masterDeviceId = useMasterDeviceIdToEdit();
    const masterDeviceRowIndex = useMasterDeviceRowIndexToEdit();

    const onSubmit = (values: any, actions: any) => {
        const url = `https://${domainName}/admin_api/master_device/${masterDeviceId}`;
        const config = axiosAuth(accessToken);

        setIsSubmitting(true);

        if (typeof (values as any).orgId === 'string') {
            (values as any).orgId = parseInt((values as any).orgId, 10);
        }

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const masterDevicesOptionToShow = { masterDevicesOptionToShow: MASTER_DEVICES_OPTIONS.TABLE };
                setIsSubmitting(false);
                setMasterDevicesOptionToShow(masterDevicesDispatch, masterDevicesOptionToShow);
                refreshMasterDevices();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const initialMasterDeviceData = {
        orgId: masterDevices[masterDeviceRowIndex].orgId,
        masterDeviceHash: masterDevices[masterDeviceRowIndex].masterDeviceHash,
    }

    const validationSchema = Yup.object().shape({
        orgId: Yup.number().integer().positive().required('Required'),
        masterDeviceHash: Yup.string().required('Required'),
    });


    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit master device</FormTitle>
            <FormContainer>
                <Formik initialValues={initialMasterDeviceData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='input'
                                            label='Org Id'
                                            name='orgId'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Master device hash'
                                            name='masterDeviceHash'
                                            type='text'
                                        />
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

export default EditMasterDevice;