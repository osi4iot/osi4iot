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
import { useGroupsDispatch, setGroupsOptionToShow } from '../../contexts/groupsOptions';
import { GROUPS_OPTIONS } from './platformAssistantOptions';
import { IGroupInputData } from './GroupsContainer';
import { ISelectOrgUser } from './TableColumns/selectOrgUsersColumns';
import SelectOrgUsersOfOrgManaged from './SelectOrgUsersOfOrgManaged';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 420px;
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

const folderPermissionOptions = [
    {
        label: "Viewer",
        value: "Viewer"
    },
    {
        label: "Editor",
        value: "Editor"
    }
];

interface CreateGroupProps {
    backToTable: () => void;
    refreshGroups: () => void;
    groupInputData: IGroupInputData;
    setGroupInputData: (groupInputData: IGroupInputData) => void;

}

const floorNumberWarning = "Floor number must an integer greater or equal to 0";

const CreateGroup: FC<CreateGroupProps> = ({ backToTable, refreshGroups, groupInputData, setGroupInputData }) => {
    const [selectedOrgId, setSelectedOrgId] = useState(1);
    const [showCreateGroup, setShowCreateGroup] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUsersArray, setSelectedUsersArray] = useState<ISelectOrgUser[]>([]);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupsDispatch = useGroupsDispatch();
    const initialGroupData = { ...groupInputData, orgId: selectedOrgId };
    if (selectedUsersArray.length !== 0) {
        const newGroupAdmins = selectedUsersArray.map(user => {
            const groupAdminData = {
                firstName: user.firstName,
                surname: user.surname,
                email: user.email,
            };
            return groupAdminData;
        });
        const lastOrgAdmin = initialGroupData.groupAdminDataArray[initialGroupData.groupAdminDataArray.length - 1];
        if (Object.values(lastOrgAdmin).filter(value => value !== "").length === 0) {
            initialGroupData.groupAdminDataArray = [...initialGroupData.groupAdminDataArray.slice(0, -1), ...newGroupAdmins];
        } else {
            initialGroupData.groupAdminDataArray = [...initialGroupData.groupAdminDataArray, ...newGroupAdmins];
        }
    }

    const onSubmit = (values: any, actions: any) => {
        const orgId = values.orgId;
        const url = `https://${domainName}/admin_api/group/${orgId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        if ((values as any).geoJsonData.trim() === "") {
            (values as any).geoJsonData = "{}";
        }

        const groupData = {
            name: values.name,
            acronym: values.acronym,
            telegramInvitationLink: values.telegramInvitationLink,
            telegramChatId: values.telegramChatId,
            folderPermission: values.folderPermission,
            groupAdminDataArray: [...values.groupAdminDataArray],
            floorNumber: values.floorNumber,
            geoJsonData: values.geoJsonData,
        }
        setIsSubmitting(true);
        axiosInstance(refreshToken, authDispatch)
            .post(url, groupData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const groupsOptionToShow = { groupsOptionToShow: GROUPS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setGroupsOptionToShow(groupsDispatch, groupsOptionToShow);
                refreshGroups();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const validationSchema = Yup.object().shape({
        orgId: Yup.number().required('Required'),
        name: Yup.string().max(190, "The maximum number of characters allowed is 200").required('Required'),
        acronym: Yup.string().max(25, "The maximum number of characters allowed is 25").required('Required'),
        folderPermission: Yup.string().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60, "The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15, "The maximum number of characters allowed is 15").required('Required'),
        groupAdminDataArray: Yup.array()
            .of(
                Yup.object().shape({
                    firstName: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    surname: Yup.string().max(127, "The maximum number of characters allowed is 127").required('Required'),
                    email: Yup.string().email("Enter a valid email").max(190, "The maximum number of characters allowed is 190").required('Required')
                })
            )
            .required('Must have org admin') // these constraints are shown if and only if inner constraints are satisfied
            .min(1, 'Must be at least one org amdin'),
        floorNumber: Yup.number().integer(floorNumberWarning).moreThan(-1,floorNumberWarning).required('Required'),
        geoJsonData: Yup.string().required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const goToSelect = (groupInputData: IGroupInputData) => {
        setGroupInputData(groupInputData);
        setShowCreateGroup(false);
    }

    return (

        <>
            {
                showCreateGroup ?
                    <>
                        <FormTitle isSubmitting={isSubmitting}>Create group</FormTitle>
                        <FormContainer>
                            <Formik initialValues={initialGroupData} validationSchema={validationSchema} onSubmit={onSubmit} >
                                {
                                    formik => (
                                        <Form>
                                            <ControlsContainer>
                                                <FormikControl
                                                    control='input'
                                                    label='OrgId'
                                                    name='orgId'
                                                    type='text'
                                                    onChange={(e: any) => { formik.handleChange(e); setSelectedOrgId(parseInt(e.target.value,10));}}
                                                />
                                                <FormikControl
                                                    control='input'
                                                    label='Group name'
                                                    name='name'
                                                    type='text'
                                                />
                                                <FormikControl
                                                    control='input'
                                                    label='Group acronym'
                                                    name='acronym'
                                                    type='text'
                                                />
                                                <FormikControl
                                                    control='select'
                                                    label='Folder permission'
                                                    name="folderPermission"
                                                    options={folderPermissionOptions}
                                                    type='text'
                                                />
                                                <FormikControl
                                                    control='input'
                                                    label='Telegram invitation link'
                                                    name='telegramInvitationLink'
                                                    type='text'
                                                />
                                                <FormikControl
                                                    control='input'
                                                    label='Telegram chat id'
                                                    name='telegramChatId'
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
                                                <FormikControl
                                                    control='inputArray'
                                                    label='Group admins'
                                                    name='groupAdminDataArray'
                                                    labelArray={['First name', 'Surname', 'Email']}
                                                    nameArray={['firstName', 'surname', 'email']}
                                                    typeArray={['text', 'text', 'email']}
                                                    addLabel="group admim"
                                                    selectLabel="user"
                                                    goToSelect={() => goToSelect(formik.values)}
                                                />                                                
                                            </ControlsContainer>
                                            <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                                        </Form>
                                    )
                                }
                            </Formik>
                        </FormContainer>
                    </>
                    :
                    <SelectOrgUsersOfOrgManaged
                        orgId={selectedOrgId}
                        backToCreate={() => setShowCreateGroup(true)}
                        setSelectedUsersArray={(selectedUsers: ISelectOrgUser[]) => setSelectedUsersArray(selectedUsers)}
                    />
            }
        </>

    )
}

export default CreateGroup;