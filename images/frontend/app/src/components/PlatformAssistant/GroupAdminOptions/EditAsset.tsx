import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { useAssetsDispatch, useAssetIdToEdit, useAssetRowIndexToEdit, setAssetsOptionToShow, useAssetInputData } from '../../../contexts/assetsOptions';
import { ASSETS_OPTIONS, ASSETS_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IAsset } from '../TableColumns/assetsColumns';
import { IAssetInputData } from '../../../contexts/assetsOptions/interfaces';
import {
    setAssetBuildingId,
    setAssetGroupId,
    setAssetInputData,
    setAssetsPreviousOption
} from '../../../contexts/assetsOptions/assetsAction';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 350px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 490px);
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

const AssetLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const AssetLocationContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 15px;
`;

const SelectAssetLocationButtonContainer = styled.div`
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


const assetTypeOptions = [
    {
        label: "Mobile",
        value: "mobile"
    },
    {
        label: "Wind turbine",
        value: "wind_turbine"
    },
    {
        label: "Generic",
        value: "generic"
    },
];

const assetInitInputFormData = {
    groupId: 0,
    description: "",
    assetType: "Generic",
    assetUid: "",
    iconRadio: 1.0,
    longitude: 0,
    latitude: 0,
}

const domainName = getDomainName();
const protocol = getProtocol();

interface EditAssetProps {
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    assets: IAsset[];
    backToTable: () => void;
    selectLocationOption: () => void;
    refreshAssets: () => void;
}

const EditAsset: FC<EditAssetProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    assets,
    backToTable,
    selectLocationOption,
    refreshAssets
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const assetsDispatch = useAssetsDispatch();
    const assetId = useAssetIdToEdit();
    const assetRowIndex = useAssetRowIndexToEdit();
    const initialAssetData = useAssetInputData();

    useEffect(() => {
        const assetsPreviousOption = { assetsPreviousOption: ASSETS_PREVIOUS_OPTIONS.EDIT_ASSET };
        setAssetsPreviousOption(assetsDispatch, assetsPreviousOption)
    }, [assetsDispatch])

    const onSubmit = (values: any, actions: any) => {
        const groupId = assets[assetRowIndex].groupId;
        const url = `${protocol}://${domainName}/admin_api/asset/${groupId}/id/${assetId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        if (typeof (values as any).longitude === 'string') {
            (values as any).longitude = parseFloat((values as any).longitude);
        }
        if (typeof (values as any).latitude === 'string') {
            (values as any).latitude = parseFloat((values as any).latitude);
        }

        if (typeof (values as any).iconRadio === 'string') {
            (values as any).iconRadio = parseFloat((values as any).iconRadio);
        }

        const assetEditData = {
            description: values.description,
            type: values.assetType,
            iconRadio: values.iconRadio,
            longitude: values.longitude,
            latitude: values.latitude,
        }

        const assetInputFormData = { assetInputFormData: assetInitInputFormData };
        setAssetInputData(assetsDispatch, assetInputFormData);

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, assetEditData, config)
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
        assetType: Yup.string().required('Required'),
        longitude: Yup.number().moreThan(-180, "The minimum value of longitude is -180").lessThan(180, "The maximum value of longitude is 180").required('Required'),
        latitude: Yup.number().moreThan(-90, "The minimum value of latitude is -90").lessThan(90, "The maximum value of latitude is 90").required('Required'),
        iconRadio: Yup.number().min(0.2, "The minimum value of the icon ratio is 0.2m").max(2, "The maximum value of the icon ratio is 2m").required('Required'),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        const assetInputFormData = { assetInputFormData: assetInitInputFormData };
        setAssetInputData(assetsDispatch, assetInputFormData);
        backToTable();
    };

    const selectLocation = (assetInputData: IAssetInputData) => {
        const groupId = assets[assetRowIndex].groupId;
        const group = groupsManaged.filter(group => group.id === groupId)[0];
        if (group.featureIndex === 0) {
            const warningMessage = "The group containing the asset does not have a defined space."
            toast.warning(warningMessage);
        } else {
            assetInputData.iconRadio = parseFloat(assetInputData.iconRadio as unknown as string);
            const orgId = assets[assetRowIndex].orgId;
            const assetInputFormData = { assetInputFormData: assetInputData };
            setAssetInputData(assetsDispatch, assetInputFormData);
            const buildingId = orgsOfGroupManaged.filter(org => org.id === orgId)[0].buildingId;
            const assetBuildingId = { assetBuildingId: buildingId };
            setAssetBuildingId(assetsDispatch, assetBuildingId);
            const assetGroupId = { assetGroupId: groupId };
            setAssetGroupId(assetsDispatch, assetGroupId);
            selectLocationOption();
        }
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit asset</FormTitle>
            <FormContainer>
                <Formik initialValues={initialAssetData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='input'
                                        label='Description'
                                        name='description'
                                        type='text'
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Type'
                                        name="assetType"
                                        options={assetTypeOptions}
                                        type='text'
                                    />
                                    <AssetLocationTitle>Asset location and icon size</AssetLocationTitle>
                                    <AssetLocationContainer>
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
                                            label='Icon radio (m)'
                                            name='iconRadio'
                                            type='text'
                                        />
                                        <SelectAssetLocationButtonContainer >
                                            <SelectLocationButton type='button' onClick={() => selectLocation(formik.values)}>
                                                Select location
                                            </SelectLocationButton>
                                        </SelectAssetLocationButtonContainer>
                                    </AssetLocationContainer>
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

export default EditAsset;