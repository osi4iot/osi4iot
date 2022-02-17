import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, axiosInstance, getDomainName } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import {
    setGroupsOptionToShow,
    useGroupIdToEdit,
    useGroupsDispatch,
    setGroupBuildingId,
    useGroupRowIndexToEdit,
    useGroupInputData,
    setGroupInputData,
    setGroupsPreviousOption
} from '../../../contexts/groupsOptions';
import { GROUPS_OPTIONS, GROUPS_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IGroup } from '../TableColumns/groupsColumns';
import { IOrgManaged } from '../TableColumns/organizationsManagedColumns';
import { IGroupInputData } from '../../../contexts/groupsOptions/interfaces';
import { setReloadDevicesTable, setReloadGroupsManagedTable, setReloadGroupsMembershipTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 420px;
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

const GroupLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const GroupLocationContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const SelectGroupLocationButtonContainer = styled.div`
    display: flex;
    margin: 10px 0 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const SelectSpaceButton = styled.button`
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
    width: 40%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
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
const floorNumberWarning = "Floor number must an integer greater or equal to 0";
const featureIndexWarning = "Feature index must an integer greater or equal to 0";

interface EditGroupProps {
    groups: IGroup[];
    orgsManagedTable: IOrgManaged[];
    backToTable: () => void;
    selectSpaceOption: () => void;
    refreshGroups: () => void;
}

const EditGroup: FC<EditGroupProps> = ({
    groups,
    orgsManagedTable,
    selectSpaceOption,
    backToTable,
    refreshGroups,
}) => {
    const authDispatch = useAuthDispatch();
    const groupsDispatch = useGroupsDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const groupId = useGroupIdToEdit();
    const editGroupInputData = useGroupInputData();
    const groupRowIndex = useGroupRowIndexToEdit();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();

    useEffect(() => {
        const groupsPreviousOption = { groupsPreviousOption: GROUPS_PREVIOUS_OPTIONS.EDIT_GROUP };
        setGroupsPreviousOption(groupsDispatch, groupsPreviousOption)
    }, [groupsDispatch])

    const onSubmit = (values: any, actions: any) => {
        const orgId = groups[groupRowIndex].orgId;
        const url = `https://${domainName}/admin_api/group/${orgId}/id/${groupId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        if (typeof (values as any).featureIndex === 'string') {
            (values as any).featureIndex = parseInt((values as any).featureIndex, 10);
        }


        setIsSubmitting(true);

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const groupsOptionToShow = { groupsOptionToShow: GROUPS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setGroupsOptionToShow(groupsDispatch, groupsOptionToShow);
                refreshGroups();
                const reloadGroupsManagedTable = true;
                setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable });
                const reloadDevicesTable = true;
                setReloadDevicesTable(plaformAssistantDispatch, { reloadDevicesTable });
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                backToTable();
            })
    }

    const validationSchema = Yup.object().shape({
        name: Yup.string().max(190, "The maximum number of characters allowed is 200").required('Required'),
        acronym: Yup.string().max(25, "The maximum number of characters allowed is 25").required('Required'),
        folderPermission: Yup.string().required('Required'),
        telegramInvitationLink: Yup.string().url("Enter a valid url").max(60, "The maximum number of characters allowed is 60").required('Required'),
        telegramChatId: Yup.string().max(15, "The maximum number of characters allowed is 15").required('Required'),
        floorNumber: Yup.number().integer(floorNumberWarning).moreThan(-1, floorNumberWarning).required('Required'),
        featureIndex: Yup.number().integer(featureIndexWarning).moreThan(-1, featureIndexWarning).required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const selectSpace = (groupInputData: IGroupInputData) => {
        const orgId = groups[groupRowIndex].orgId;
        const groupInputFormData = { groupInputFormData: groupInputData };
        setGroupInputData(groupsDispatch, groupInputFormData);
        const orgsManagedTableFiltered = orgsManagedTable.filter(org => org.id === orgId);
        if (orgsManagedTableFiltered.length === 0) {
            const warningMessage = "To select a location for the group orgs managed must been updated"
            toast.warning(warningMessage);
        } else {
            const buildingId =  orgsManagedTableFiltered[0].buildingId;
            const groupBuildingId = { groupBuildingId: buildingId };
            setGroupBuildingId(groupsDispatch, groupBuildingId);
            selectSpaceOption();
        }
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit group</FormTitle>
            <FormContainer>
                <Formik initialValues={editGroupInputData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
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
                                    <GroupLocationTitle>Group location</GroupLocationTitle>
                                    <GroupLocationContainer>
                                        <FormikControl
                                            control='input'
                                            label='Floor number'
                                            name='floorNumber'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Feature index'
                                            name='featureIndex'
                                            type='text'
                                        />
                                        <SelectGroupLocationButtonContainer >
                                            <SelectSpaceButton type='button' onClick={() => selectSpace(formik.values)}>
                                                Select space
                                            </SelectSpaceButton>
                                        </SelectGroupLocationButtonContainer>
                                    </GroupLocationContainer>
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

export default EditGroup;