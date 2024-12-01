import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import {
    useGroupsDispatch,
    setGroupsOptionToShow,
    setGroupBuildingId,
    setGroupsPreviousOption,
    setGroupInputData
} from '../../../contexts/groupsOptions';
import { GROUPS_OPTIONS, GROUPS_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { ISelectOrgUser } from '../TableColumns/selectOrgUsersColumns';
import SelectOrgUsersOfOrgManaged from './SelectOrgUsersOfOrgManaged';
import { IOrgManaged } from '../TableColumns/organizationsManagedColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IGroupInputData } from '../../../contexts/groupsOptions/interfaces';
import {
    setReloadAssetsTable,
    setReloadDashboardsTable,
    setReloadDigitalTwinsTable,
    setReloadGroupMembersTable,
    setReloadGroupsManagedTable,
    setReloadGroupsMembershipTable,
    setReloadNodeRedInstancesTable,
    setReloadOrgsOfGroupsManagedTable,
    setReloadSensorsTable,
    setReloadTopicsTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { ControlsContainer, FormContainer } from '../GroupAdminOptions/CreateAsset';
import { AxiosError, AxiosResponse } from 'axios';

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

const domainName = getDomainName();
const protocol = getProtocol();

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

const mqttAccessControlOptions = [
    {
        label: "Subscribe & Publish",
        value: "Pub & Sub"
    },
    {
        label: "Subscribe",
        value: "Sub"
    },
    {
        label: "Publish",
        value: "Pub"
    },
    {
        label: "None",
        value: "None"
    }
];

const initialCreateGroupInputData = {
    orgId: 1,
    name: "",
    acronym: "",
    folderPermission: "Viewer",
    telegramInvitationLink: "",
    telegramChatId: "",
    floorNumber: 0,
    featureIndex: 1,
    mqttAccessControl: "Pub & Sub",
    groupAdminDataArray: [
        {
            firstName: "",
            surname: "",
            email: "",
        }
    ]
}

type FormikType = FormikProps<IGroupInputData>

interface CreateGroupProps {
    buildings: IBuilding[];
    floors: IFloor[];
    selectFloor: (floorSelected: IFloor | null) => void;
    initialGroupData: IGroupInputData;
    orgsManagedTable: IOrgManaged[];
    backToTable: () => void;
    selectSpaceOption: () => void;
    refreshGroups: () => void;
}

const floorNumberWarning = "Floor number must an integer greater or equal to 0";
const featureIndexWarning = "Feature index must an integer greater or equal to 0";

const CreateGroup: FC<CreateGroupProps> = ({
    buildings,
    floors,
    selectFloor,
    initialGroupData,
    orgsManagedTable,
    backToTable,
    selectSpaceOption,
    refreshGroups,
}) => {
    const [selectedOrgId, setSelectedOrgId] = useState(initialGroupData.orgId as number);
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [showCreateGroup, setShowCreateGroup] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUsersArray, setSelectedUsersArray] = useState<ISelectOrgUser[]>([]);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupsDispatch = useGroupsDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);

    useEffect(() => {
        if (selectedUsersArray.length !== 0) {
            const newGroupAdmins = selectedUsersArray.map(user => {
                const groupAdminData = {
                    firstName: user.firstName,
                    surname: user.surname,
                    email: user.email,
                };
                return groupAdminData;
            });
            if (initialGroupData.groupAdminDataArray) {
                const lastOrgAdmin = initialGroupData.groupAdminDataArray[initialGroupData.groupAdminDataArray.length - 1];
                if (Object.values(lastOrgAdmin).filter(value => value !== "").length === 0) {
                    initialGroupData.groupAdminDataArray = [...initialGroupData.groupAdminDataArray.slice(0, -1), ...newGroupAdmins];
                } else {
                    initialGroupData.groupAdminDataArray = [...initialGroupData.groupAdminDataArray, ...newGroupAdmins];
                }
                const newgroupInputData = { ...initialGroupData };
                const groupInputFormData = { groupInputFormData: newgroupInputData }
                setGroupInputData(groupsDispatch, groupInputFormData);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedUsersArray])

    useEffect(() => {
        const orgArray = orgsManagedTable.map(org => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
    }, [
        orgsManagedTable
    ]);

    useEffect(() => {
        const groupsPreviousOption = { groupsPreviousOption: GROUPS_PREVIOUS_OPTIONS.CREATE_GROUP };
        setGroupsPreviousOption(groupsDispatch, groupsPreviousOption)
    }, [groupsDispatch]);

    const onSubmit = (values: any, actions: any) => {
        const orgId = selectedOrgId;
        const url = `${protocol}://${domainName}/admin_api/group/${orgId}`;
        const config = axiosAuth(accessToken);

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        if (typeof (values as any).featureIndex === 'string') {
            (values as any).featureIndex = parseInt((values as any).featureIndex, 10);
        }

        const groupData = {
            name: values.name,
            acronym: values.acronym,
            telegramInvitationLink: values.telegramInvitationLink,
            telegramChatId: values.telegramChatId,
            folderPermission: values.folderPermission,
            groupAdminDataArray: [...values.groupAdminDataArray],
            floorNumber: values.floorNumber,
            featureIndex: values.featureIndex,
            mqttAccessControl: values.mqttAccessControl,
        }
        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, groupData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                setIsSubmitting(false);
                const groupsOptionToShow = { groupsOptionToShow: GROUPS_OPTIONS.TABLE };
                setGroupsOptionToShow(groupsDispatch, groupsOptionToShow);
                toast.success(data.message);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshGroups();
                const reloadGroupsManagedTable = true;
                setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable })
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
                const reloadNodeRedInstancesTable = true;
                setReloadNodeRedInstancesTable(plaformAssistantDispatch, { reloadNodeRedInstancesTable });

                const reloadOrgsOfGroupsManagedTable = true;
                setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
                const reloadGroupMembersTable = true;
                setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
                const reloadAssetsTable = true;
                setReloadAssetsTable(plaformAssistantDispatch, { reloadAssetsTable });
                const reloadSensorsTable = true;
                setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadDigitalTwinsTable = true;
                setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            })
    }

    const validationSchema = Yup.object().shape({
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
        floorNumber: Yup.number().integer(floorNumberWarning).moreThan(-1, floorNumberWarning).required('Required'),
        featureIndex: Yup.number().integer(featureIndexWarning).moreThan(-1, featureIndexWarning).required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        const groupInputData = { ...initialCreateGroupInputData };
        const groupInputFormData = { groupInputFormData: groupInputData }
        setGroupInputData(groupsDispatch, groupInputFormData);
        backToTable();
    };

    const goToSelect = (groupInputData: IGroupInputData) => {
        const newgroupInputData = { ...groupInputData, orgId: selectedOrgId };
        const groupInputFormData = { groupInputFormData: newgroupInputData }
        setGroupInputData(groupsDispatch, groupInputFormData);
        setShowCreateGroup(false);
    }

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const orgSelected = orgsManagedTable.filter(org => org.acronym === orgAcronym)[0];
        const orgId = orgSelected.id;
        setSelectedOrgId(orgId);
        const groupInputData = formik.values;
        const newgroupInputData = { ...groupInputData, orgId };
        const groupInputFormData = { groupInputFormData: newgroupInputData }
        setGroupInputData(groupsDispatch, groupInputFormData);
    }

    const selectSpace = (groupInputData: IGroupInputData) => {
        const newgroupInputData = { ...groupInputData, orgId: selectedOrgId };
        const groupInputFormData = { groupInputFormData: newgroupInputData }
        setGroupInputData(groupsDispatch, groupInputFormData);
        const orgFiltered = orgsManagedTable.filter(org => org.id === selectedOrgId)[0];
        if (orgFiltered !== undefined) {
            const existBuilding = buildings.filter(building => building.id === orgFiltered.buildingId).length !== 0;
            if (existBuilding) {
                const groupBuildingId = { groupBuildingId: orgFiltered.buildingId };
                const buildingId = orgFiltered.buildingId;
                const floorNumber = parseInt(groupInputData.floorNumber as unknown as string, 10);
                const floorSelected = floors.filter(floor =>
                    floor.buildingId === buildingId &&
                    floor.floorNumber === floorNumber
                )[0];
                if (floorSelected) {
                    selectFloor(floorSelected);
                }
                setGroupBuildingId(groupsDispatch, groupBuildingId);
                selectSpaceOption();
            } else {
                const warningMessage = `Not exist a building with id=${orgFiltered.buildingId}`
                toast.warning(warningMessage);
            }
        } else {
            const warningMessage = `None organization with id: ${selectedOrgId} has been defined`
            toast.warning(warningMessage);
        }
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
                                                    control='select'
                                                    label='Select org'
                                                    name='orgAcronym'
                                                    type='text'
                                                    options={orgOptions}
                                                    onChange={(e) => handleChangeOrg(e, formik)}
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
                                                    control='select'
                                                    label='Mqtt access control'
                                                    name="mqttAccessControl"
                                                    options={mqttAccessControlOptions}
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
                                            <FormButtonsProps
                                                onCancel={onCancel}
                                                isValid={formik.isValid}
                                                isSubmitting={formik.isSubmitting}
                                            />
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