import { FC, SyntheticEvent, useState } from 'react';
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
import {
    useOrgsDispatch,
    useOrgRowIndexToEdit,
    setOrgsOptionToShow,
    useOrgIdToEdit
} from '../../contexts/orgsOptions';
import { ORGS_OPTIONS } from './platformAssistantOptions';
import { IOrganization } from './TableColumns/organizationsColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 290px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
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

interface EditOrganizationProps {
    organizations: IOrganization[];
    refreshOrgs: () => void;
    backToTable: () => void;
}

const EditOrganization: FC<EditOrganizationProps> = ({ organizations, refreshOrgs, backToTable }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const orgsDispatch = useOrgsDispatch();
    const { accessToken } = useAuthState();
    const orgRowIndex = useOrgRowIndexToEdit();
    const orgId = useOrgIdToEdit()

    const initialOrgData = {
        name: organizations[orgRowIndex].name,
        acronym: organizations[orgRowIndex].acronym,
        address: organizations[orgRowIndex].address,
        city: organizations[orgRowIndex].city,
        zipCode: organizations[orgRowIndex].zipCode,
        state: organizations[orgRowIndex].state,
        country: organizations[orgRowIndex].country,
        longitude: organizations[orgRowIndex].longitude,
        latitude: organizations[orgRowIndex].latitude
    }
    
    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190,"The maximum number of characters allowed is 190").required('Required'),
        acronym: Yup.string().max(20,"The maximum number of characters allowed is 20").required('Required'),
        address: Yup.string().max(255,"The maximum number of characters allowed is 255").required('Required'),
        city: Yup.string().max(255,"The maximum number of characters allowed is 255").required('Required'),
        zipCode: Yup.string().max(50,"The maximum number of characters allowed is 50").required('Required'),
        state: Yup.string().max(255,"The maximum number of characters allowed is 255").required('Required'),
        country: Yup.string().max(255,"The maximum number of characters allowed is 255").required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
    });

    const onSubmit = (values: {}, actions: any) => {
        const url = `https://${domainName}/admin_api/organization/id/${orgId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axios
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const orgsOptionToShow = { orgsOptionToShow: ORGS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setOrgsOptionToShow(orgsDispatch, orgsOptionToShow);
                refreshOrgs();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit org</FormTitle>
            <FormContainer>
                <Formik initialValues={initialOrgData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='Org name'
                                        name='name'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='Org acronym'
                                        name='acronym'
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

export default EditOrganization;