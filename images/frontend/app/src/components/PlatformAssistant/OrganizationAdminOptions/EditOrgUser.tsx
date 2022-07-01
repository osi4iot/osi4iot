import { FC, SyntheticEvent,useState } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import {
    useOrgUsersDispatch,
    setOrgUsersOptionToShow,
    useOrgUserOrgIdToEdit,
    useOrgUserUserIdToEdit,
    useOrgUserRowIndexToEdit
} from '../../../contexts/orgUsersOptions';
import { ORG_USERS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IOrgUser } from '../TableColumns/orgUsersColumns';
import { setReloadGroupMembersTable, setReloadGroupsMembershipTable, setReloadOrgsMembershipTable, setReloadSelectOrgUsersTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';


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

const roleInOrgOptions = [
    {
        label: "Viewer",
        value: "Viewer"
    },
    {
        label: "Editor",
        value: "Editor"
    },
    {
        label: "Admin",
        value: "Admin"
    }
];

const domainName = getDomainName();
const protocol = getProtocol();

interface EditOrgUserProps {
    orgUsers: IOrgUser[];
    backToTable: () => void;
    refreshOrgUsers: () => void;
}


const EditOrgUser: FC<EditOrgUserProps> = ({ orgUsers, backToTable, refreshOrgUsers }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const orgsUsersDispatch = useOrgUsersDispatch();
    const orgId = useOrgUserOrgIdToEdit()
    const userId = useOrgUserUserIdToEdit();
    const orgsUsersRowIndex = useOrgUserRowIndexToEdit()

    const initialOrgUserData = {
        roleInOrg: orgUsers[orgsUsersRowIndex].roleInOrg
    }

    const validationSchema = Yup.object().shape({
        roleInOrg: Yup.string().required('Required'),
    })

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/organization/${orgId}/user/id/${userId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                setIsSubmitting(false);
                setOrgUsersOptionToShow(orgsUsersDispatch, { orgUsersOptionToShow: ORG_USERS_OPTIONS.TABLE });
                refreshOrgUsers();
                const reloadSelectOrgUsersTable = true;
                setReloadSelectOrgUsersTable(plaformAssistantDispatch, { reloadSelectOrgUsersTable });
                const reloadGroupMembersTable = true;
                setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
                const reloadOrgsMembershipTable = true;
                setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });                
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if(errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit role for org user</FormTitle>
            <FormContainer>
                <Formik initialValues={initialOrgUserData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FieldContainer>
                                        <label>First Name</label>
                                        <div>{orgUsers[orgsUsersRowIndex].firstName || ""}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Surname</label>
                                        <div>{orgUsers[orgsUsersRowIndex].surname  || ""}</div>
                                    </FieldContainer>                                    
                                    <FieldContainer>
                                        <label>Email</label>
                                        <div>{orgUsers[orgsUsersRowIndex].email}</div>
                                    </FieldContainer>  
                                    <FieldContainer>
                                        <label>Username</label>
                                        <div>{orgUsers[orgsUsersRowIndex].login}</div>
                                    </FieldContainer> 
                                    <FormikControl
                                        control='select'
                                        label='Role in org'
                                        name="roleInOrg"
                                        options={roleInOrgOptions}
                                        type='text'
                                        autoFocus={true}
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

export default EditOrgUser;