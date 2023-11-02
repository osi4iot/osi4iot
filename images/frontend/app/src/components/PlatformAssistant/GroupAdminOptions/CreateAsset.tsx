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
import { ASSETS_OPTIONS, ASSETS_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import {
    setAssetBuildingId,
    setAssetGroupId,
    setAssetInputData,
    setAssetsOptionToShow,
    setAssetsPreviousOption,
    useAssetInputData,
    useAssetsDispatch
} from '../../../contexts/assetsOptions';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IAssetType } from '../TableColumns/assetTypesColumns';
import SvgComponent from '../../Tools/SvgComponent';

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

    div:nth-child(3) {
        margin-bottom: 10px;
    }

    div:last-child {
        margin-bottom: 3px;
    }
`;

const AssetLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const AssetLocationContainerDiv = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const SelectAssetLocationDivButtonContainer = styled.div`
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

const SvgIconPreviewContainerDiv = styled.div`
    margin: 5px 0;
    width: 100%;
`;

const SvgIconPreviewTitle = styled.div`
    margin-bottom: 5px;
`;

const SvgComponentContainerDiv = styled.div`
    padding: 10px;
    border: 2px solid #2c3235;
    border-radius: 10px;
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
`;

const domainName = getDomainName();
const protocol = getProtocol();

const findGroupArray = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) {
            groupArray[orgAcronym].push(group.acronym);
        }
    }
    return groupArray;
}

const findAssetTypeArray = (orgsOfGroupManaged: IOrgOfGroupsManaged[], assetTypes: IAssetType[]): Record<string, string[]> => {
    const assetTypeArray: Record<string, string[]> = {}
    for (const assetType of assetTypes) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === assetType.orgId)[0].acronym;
        if (assetTypeArray[orgAcronym] === undefined) {
            assetTypeArray[orgAcronym] = [];
        }
        const type = assetType.type;
        if (assetTypeArray[orgAcronym].indexOf(type) === -1) {
            assetTypeArray[orgAcronym].push(type);
        }
    }
    return assetTypeArray;
}

interface InitialAssetData {
    orgAcronym: string;
    groupAcronym: string;
    assetType: string;
    description: string;
    longitude: number;
    latitude: number;
    iconRadio: number;
    iconSizeFactor: number;
}

type FormikType = FormikProps<InitialAssetData>

interface CreateAssetProps {
    backToTable: () => void;
    refreshAssets: () => void;
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    assetTypes: IAssetType[];
    selectLocationOption: () => void;
}

const CreateAsset: FC<CreateAssetProps> = ({
    backToTable,
    refreshAssets,
    orgsOfGroupManaged,
    groupsManaged,
    assetTypes,
    selectLocationOption
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const assetsDispatch = useAssetsDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetTypeArray, setAssetTypeArray] = useState<Record<string, string[]>>({});
    const [assetTypeOptions, setAssetTypeOptions] = useState<IOption[]>([]);
    const initialOrg = orgsOfGroupManaged[0];
    const storedAssetData = useAssetInputData();
    const storedOrgAcronym = storedAssetData.orgAcronym;
    const storedGroupAcronym = storedAssetData.groupAcronym;
    const storedAssetType = storedAssetData.assetType;
    const initialGroup = groupsManaged.filter(group => group.orgId === initialOrg.id)[0];
    const initialAssetType = assetTypes.filter(item => item.orgId === initialOrg.id)[0];
    const storedIconSvgString = storedAssetData.iconSvgString;
    const [iconSvgString, setIconSvgString] = useState(storedIconSvgString !== "" ?
        storedIconSvgString :
        initialAssetType.iconSvgString
    );

    const initialAssetData = {
        orgAcronym: storedOrgAcronym !== "" ? storedOrgAcronym : initialOrg.acronym,
        groupAcronym: storedGroupAcronym !== "" ? storedGroupAcronym : initialGroup.acronym,
        assetType: storedAssetType !== "" ? storedAssetType : initialAssetType.type,
        description: storedAssetData.description,
        longitude: storedAssetData.longitude,
        latitude: storedAssetData.latitude,
        iconRadio: storedAssetData.iconRadio,
        iconSizeFactor: storedAssetData.iconSizeFactor,
    }

    useEffect(() => {
        if (assetTypes.length !== 0) {
            const orgArray = orgsOfGroupManaged.map(org => org.acronym);
            setOrgOptions(convertArrayToOptions(orgArray));
            const groupArray = findGroupArray(orgsOfGroupManaged, groupsManaged);
            setGroupArray(groupArray);
            const orgAcronym = orgsOfGroupManaged[0].acronym;
            const groupsForOrgSelected = groupArray[orgAcronym];
            setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
            const assetTypeArray = findAssetTypeArray(orgsOfGroupManaged, assetTypes);
            setAssetTypeArray(assetTypeArray);
            const assetTypesForOrgSelected = assetTypeArray[orgAcronym];
            setAssetTypeOptions(convertArrayToOptions(assetTypesForOrgSelected));
        }
    }, [assetTypes, groupsManaged, orgsOfGroupManaged]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetTypesForOrgSelected = assetTypeArray[orgAcronym];
        setAssetTypeOptions(convertArrayToOptions(assetTypesForOrgSelected));
        const assetType = assetTypesForOrgSelected[0];
        formik.setFieldValue("assetType", assetType);
        const orgId = orgsOfGroupManaged.filter(org => org.acronym === orgAcronym)[0].id;
        const iconSvgString = assetTypes.filter(item => item.orgId === orgId && item.type === assetType)[0].iconSvgString;
        setIconSvgString(iconSvgString);
    }

    const handleChangeAssetType = (e: { value: string }, formik: FormikType) => {
        const assetType = e.value;
        const orgAcronym = formik.values.orgAcronym;
        const orgId = orgsOfGroupManaged.filter(org => org.acronym === orgAcronym)[0].id;
        const iconSvgString = assetTypes.filter(item => item.orgId === orgId && item.type === assetType)[0].iconSvgString;
        setIconSvgString(iconSvgString);
        formik.setFieldValue("assetType", assetType);
    }

    useEffect(() => {
        const assetsPreviousOption = { assetsPreviousOption: ASSETS_PREVIOUS_OPTIONS.CREATE_ASSET };
        setAssetsPreviousOption(assetsDispatch, assetsPreviousOption)
    }, [assetsDispatch])

    const onSubmit = (values: any, actions: any) => {
        const groupId = groupsManaged.filter(group => group.acronym === values.groupAcronym)[0].id;
        const url = `${protocol}://${domainName}/admin_api/asset/${groupId}`;
        const config = axiosAuth(accessToken);

        const orgId = orgsOfGroupManaged.filter(org => org.acronym === values.orgAcronym)[0].id;
        const assetTypeId = assetTypes.filter(assetType => assetType.orgId === orgId && assetType.type === values.assetType)[0].id;

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }
        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        if (typeof (values as any).iconRadio === 'string') {
            (values as any).iconRadio = parseFloat((values as any).iconRadio);
        }

        if (typeof (values as any).iconSizeFactor === 'string') {
            (values as any).iconSizeFactor = parseFloat((values as any).iconSizeFactor);
        }

        const assetData = {
            description: values.description,
            assetTypeId,
            iconRadio: values.iconRadio,
            iconSizeFactor: values.iconSizeFactor,
            longitude: values.longitude,
            latitude: values.latitude,
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, assetData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const assetsOptionToShow = { assetsOptionToShow: ASSETS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setAssetsOptionToShow(assetsDispatch, assetsOptionToShow);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshAssets();
            })
    }

    const validationSchema = Yup.object().shape({
        description: Yup.string().max(190, "The maximum number of characters allowed is 190").required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        iconRadio: Yup.number().min(0.2, "The minimum value of the icon ratio is 0.2m").max(2, "The maximum value of the icon ratio is 2m").required('Required'),
        iconSizeFactor: Yup.number().min(0.1, "The minimum value of the icon size factor is 0.1").max(2, "The maximum value of the icon size factor is 2").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const selectLocation = (initialAssetData: InitialAssetData) => {
        const orgId = orgsOfGroupManaged.filter(org => org.acronym === initialAssetData.orgAcronym)[0].id;
        const group = groupsManaged.filter(group => group.acronym === initialAssetData.groupAcronym)[0];
        if (!group) {
            const warningMessage = "The groupId indicated not exists or not corresponds to a group managed by the user."
            toast.warning(warningMessage);
        } else {
            const assetInputData = {
                orgAcronym: initialAssetData.orgAcronym,
                orgId,
                groupAcronym: initialAssetData.groupAcronym,
                groupId: group.id,
                assetUid: "",
                assetType: initialAssetData.assetType,
                description: initialAssetData.description,
                iconRadio: parseFloat(initialAssetData.iconRadio as unknown as string),
                iconSizeFactor: parseFloat(initialAssetData.iconSizeFactor as unknown as string),
                longitude: parseFloat(initialAssetData.longitude as unknown as string),
                latitude: parseFloat(initialAssetData.latitude as unknown as string),
                iconSvgString
            }
            if (group.featureIndex === 0) {
                const warningMessage = "The group containing the asset does not have a defined space."
                toast.warning(warningMessage);
            } else {
                const assetInputFormData = { assetInputFormData: assetInputData };
                setAssetInputData(assetsDispatch, assetInputFormData);
                const assetGroupId = { assetGroupId: group.id };
                setAssetGroupId(assetsDispatch, assetGroupId);
                const buildingId = orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].buildingId;
                const assetBuildingId = { assetBuildingId: buildingId };
                setAssetBuildingId(assetsDispatch, assetBuildingId);
                selectLocationOption();
            }
        }
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create asset</FormTitle>
            <FormContainer>
                <Formik initialValues={initialAssetData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='select'
                                        label='Org acronym'
                                        name='orgAcronym'
                                        options={orgOptions}
                                        type='text'
                                        onChange={(e) => handleChangeOrg(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Group acronym'
                                        name='groupAcronym'
                                        options={groupOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Asset type'
                                        name='assetType'
                                        options={assetTypeOptions}
                                        type='text'
                                        onChange={(e) => handleChangeAssetType(e, formik)}
                                    />
                                    {
                                        iconSvgString !== "" &&
                                        <SvgIconPreviewContainerDiv>
                                            <SvgIconPreviewTitle>
                                                Icon preview
                                            </SvgIconPreviewTitle>
                                            <SvgComponentContainerDiv>
                                                <SvgComponent
                                                    svgString={iconSvgString}
                                                    imgWidth="100"
                                                    imgHeight="100"
                                                    backgroundColor="#202226"
                                                />
                                            </SvgComponentContainerDiv>
                                        </SvgIconPreviewContainerDiv>
                                    }
                                    <FormikControl
                                        control='input'
                                        label='Description'
                                        name='description'
                                        type='text'
                                    />
                                    <AssetLocationTitle>Asset location and icon size</AssetLocationTitle>
                                    <AssetLocationContainerDiv>
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
                                            control='input'
                                            label='Icon ratio'
                                            name='iconRadio'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Icon size factor'
                                            name='iconSizeFactor'
                                            type='text'
                                        />
                                        <SelectAssetLocationDivButtonContainer >
                                            <SelectLocationButton type='button' onClick={() => selectLocation(formik.values)}>
                                                Select location
                                            </SelectLocationButton>
                                        </SelectAssetLocationDivButtonContainer>
                                    </AssetLocationContainerDiv>
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

export default CreateAsset;