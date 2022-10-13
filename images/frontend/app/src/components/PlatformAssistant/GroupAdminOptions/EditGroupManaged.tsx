import { FC, useState, SyntheticEvent } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { GROUPS_MANAGED_OPTIONS } from '../Utils/platformAssistantOptions';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import {
    setGroupManagedInputFormData,
    setGroupsManagedBuildingId,
    setGroupsManagedOptionToShow,
    useGroupManagedIdToEdit,
    useGroupManagedInputFormData,
    useGroupManagedRowIndex,
    useGroupsManagedDispatch
} from '../../../contexts/groupsManagedOptions';
import { IGroupManagedData } from '../../../contexts/groupsManagedOptions/interfaces';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
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

    div:last-child {
        margin-bottom: 3px;
    }
`;

const NriLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const NriLocationContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const SelectNriLocationButtonContainer = styled.div`
    display: flex;
    margin: 10px 0 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const SelectLocationButton = styled.button`
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
    width: 60%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const groupManagedInitInputFormData = {
    groupId: 0,
    name: "",
    acronym: "",
    orgId: 0,
    folderPermission: "Viewer",
    telegramInvitationLink: "",
    telegramChatId: "",
    nriInGroupId: 0,
    nriInGroupIconLongitude: 0,
    nriInGroupIconLatitude: 0,
    nriInGroupIconRadio: 1.0
}

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


const domainName = getDomainName();
const protocol = getProtocol();

interface EditGroupManagedProps {
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    backToTable: () => void;
    selectLocationOption: () => void;
    refreshGroupsManaged: () => void;
}

const EditGroupManaged: FC<EditGroupManagedProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    backToTable,
    selectLocationOption,
    refreshGroupsManaged
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupsManagedDispatch = useGroupsManagedDispatch();
    const groupManagedId = useGroupManagedIdToEdit();
    const groupManagedRowIndex = useGroupManagedRowIndex();
    const initialGroupManagedData = useGroupManagedInputFormData();

    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/group_user_managed/${groupManagedId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        if (typeof (values as any).nriInGroupIconLongitude === 'string') {
            (values as any).nriInGroupIconLongitude = parseFloat((values as any).nriInGroupIconLongitude);
        }
        if (typeof (values as any).nriInGroupIconLatitude === 'string') {
            (values as any).nriInGroupIconLatitude = parseFloat((values as any).nriInGroupIconLatitude);
        }

        if (typeof (values as any).nriInGroupIconRadio === 'string') {
            (values as any).nriInGroupIconRadio = parseFloat((values as any).nriInGroupIconRadio);
        }

        const groupManagedUpdateData = {
            folderPermission: values.folderPermission,
            telegramInvitationLink: values.telegramInvitationLink,
            telegramChatId: values.telegramChatId,
            nriInGroupId: groupsManaged[groupManagedRowIndex].nriInGroupId,
            nriInGroupIconLongitude: values.nriInGroupIconLongitude,
            nriInGroupIconLatitude: values.nriInGroupIconLatitude,
            nriInGroupIconRadio: values.nriInGroupIconRadio,
        }

        // const groupManagedInputFormData = { groupManagedInputFormData: groupManagedUpdateData };
        // setGroupManagedInputFormData(groupsManagedDispatch, groupManagedInputFormData);

        axiosInstance(refreshToken, authDispatch)
            .patch(url, groupManagedUpdateData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const groupsManagedOptionToShow = { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.TABLE };
                setIsSubmitting(false);
                setGroupsManagedOptionToShow(groupsManagedDispatch, groupsManagedOptionToShow);
                refreshGroupsManaged();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if (errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }

    const validationSchema = Yup.object().shape({
        folderPermission: Yup.string().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60, "The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15, "The maximum number of characters allowed is 15").required('Required'),
        nriInGroupIconLongitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        nriInGroupIconLatitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        nriInGroupIconRadio: Yup.number().min(0.2, "The minimum value of the icon ratio is 0.2m").max(2, "The maximum value of the icon ratio is 2m").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        const groupManagedInputFormData = { groupManagedInputFormData: groupManagedInitInputFormData };
        setGroupManagedInputFormData(groupsManagedDispatch, groupManagedInputFormData);
        backToTable();
    };

    const selectLocation = (groupManagedInputData: IGroupManagedData) => {
        groupManagedInputData.nriInGroupIconRadio = parseFloat(groupManagedInputData.nriInGroupIconRadio as unknown as string);
        const orgId = groupsManaged[groupManagedRowIndex].orgId;
        const groupManagedInputFormData = { groupManagedInputFormData: groupManagedInputData };
        setGroupManagedInputFormData(groupsManagedDispatch, groupManagedInputFormData);
        const buildingId = orgsOfGroupManaged.filter(org => org.id === orgId)[0].buildingId;
        const groupManagedBuildingId = { groupManagedBuildingId: buildingId };
        setGroupsManagedBuildingId(groupsManagedDispatch, groupManagedBuildingId);
        selectLocationOption();
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit group managed</FormTitle>
            <FormContainer>
                <Formik initialValues={initialGroupManagedData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FieldContainer>
                                        <label>GroupId</label>
                                        <div>{groupManagedId}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>OrgId</label>
                                        <div>{groupsManaged[groupManagedRowIndex].orgId}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Name</label>
                                        <div>{groupsManaged[groupManagedRowIndex].name}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Acronym</label>
                                        <div>{groupsManaged[groupManagedRowIndex].acronym}</div>
                                    </FieldContainer>
                                    <FieldContainer>
                                        <label>Mqtt access control</label>
                                        <div>{groupsManaged[groupManagedRowIndex].mqttAccessControl}</div>
                                    </FieldContainer>
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
                                    <NriLocationTitle>Node-red instance icon location and size</NriLocationTitle>
                                    <NriLocationContainer>
                                        <FormikControl
                                            control='input'
                                            label='Longitude'
                                            name='nriInGroupIconLongitude'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Latitude'
                                            name='nriInGroupIconLatitude'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Icon radio (m)'
                                            name='nriInGroupIconRadio'
                                            type='text'
                                        />
                                        <SelectNriLocationButtonContainer >
                                            <SelectLocationButton type='button' onClick={() => selectLocation(formik.values)}>
                                                Select location
                                            </SelectLocationButton>
                                        </SelectNriLocationButtonContainer>
                                    </NriLocationContainer>
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

export default EditGroupManaged;