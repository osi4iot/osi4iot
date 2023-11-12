import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { useHistory } from "react-router-dom";
import { Formik, Form, FormikProps } from 'formik';
import FormikControl from "./FormikControl";
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from '../../tools/tools';
import S3StorageFormButtons from './S3StorageFormButtons';
import IAssetS3Folder from '../PlatformAssistant/TableColumns/assetS3Folder.interface';
import { getAxiosInstance } from '../../tools/axiosIntance';
import { useAuthDispatch, useAuthState } from '../../contexts/authContext';
import axiosErrorHandler from '../../tools/axiosErrorHandler';
import { toast } from 'react-toastify';
import FormTitle from './FormTitle';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 330px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 430px);
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

const NoDataContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100px;
`;



export interface InitialAsssetS3FolderData {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    assetDescription: string;
    s3FolderName: string;
    year: string;
}

type FormikType = FormikProps<InitialAsssetS3FolderData>

interface S3StorageFormProps {
    assetS3Folders: IAssetS3Folder[];
    refreshAssetS3Folders: () => void;
}

const findOrgArray = (assetS3Folders: IAssetS3Folder[]): string[] => {
    const orgArray: string[] = []
    for (const s3Folder of assetS3Folders) {
        if (orgArray.indexOf(s3Folder.orgAcronym) === -1) {
            orgArray.push(s3Folder.orgAcronym);
        }
    }
    return orgArray;
}

const findGroupArray = (assetS3Folders: IAssetS3Folder[]): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const s3Folder of assetS3Folders) {
        if (groupArray[s3Folder.orgAcronym] === undefined) {
            groupArray[s3Folder.orgAcronym] = [];
        }
        if (groupArray[s3Folder.orgAcronym].indexOf(s3Folder.groupAcronym) === -1) {
            groupArray[s3Folder.orgAcronym].push(s3Folder.groupAcronym);
        }
    }
    return groupArray;
}

const findAssetNameArray = (assetS3Folders: IAssetS3Folder[]): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {}
    for (const s3Folder of assetS3Folders) {
        if (assetArray[s3Folder.groupAcronym] === undefined) {
            assetArray[s3Folder.groupAcronym] = [];
        }
        const assetName = `Asset_${s3Folder.assetUid}`;
        if (assetArray[s3Folder.groupAcronym].indexOf(assetName) === -1) {
            assetArray[s3Folder.groupAcronym].push(assetName);
        }
    }
    return assetArray;
}

const findAssetDescription = (assetS3Folders: IAssetS3Folder[], assetName: string): string => {
    const assetS3Folder = assetS3Folders.filter(s3Folder => `Asset_${s3Folder.assetUid}` === assetName)[0];
    return assetS3Folder.assetDescription;
}

const findS3FolderNameArray = (assetS3Folders: IAssetS3Folder[]): Record<string, string[]> => {
    const s3FolderNameArray: Record<string, string[]> = {}
    for (const s3Folder of assetS3Folders) {
        const assetName = `Asset_${s3Folder.assetUid}`;
        if (s3FolderNameArray[assetName] === undefined) {
            s3FolderNameArray[assetName] = [];
        }
        if (s3FolderNameArray[assetName].indexOf(s3Folder.s3Folder) === -1) {
            s3FolderNameArray[assetName].push(s3Folder.s3Folder);
        }
    }
    return s3FolderNameArray;
}

const findYearArray = (assetS3Folders: IAssetS3Folder[], assetName: string, s3FolderName: string): string[] => {
    const assetS3Folder = assetS3Folders.filter(s3Folder =>
        `Asset_${s3Folder.assetUid}` === assetName &&
        s3Folder.s3Folder === s3FolderName
    )[0];
    return assetS3Folder.years;
}

const findAssetS3FolderSelected = (
    assetS3Folders: IAssetS3Folder[],
    orgAcronym: string,
    groupAcronym: string,
    assetName: string,
    s3FolderName: string,
): IAssetS3Folder => {
    const s3FolderSelected = assetS3Folders.filter(s3Folder =>
        s3Folder.orgAcronym === orgAcronym &&
        s3Folder.groupAcronym === groupAcronym &&
        `Asset_${s3Folder.assetUid}` === assetName &&
        s3Folder.s3Folder === s3FolderName
    )[0];
    return s3FolderSelected;
}

const domainName = getDomainName();
const protocol = getProtocol();


const S3StorageForm: FC<S3StorageFormProps> = (
    {
        assetS3Folders,
        refreshAssetS3Folders
    }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const history = useHistory();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>("");
    const [s3FolderNameArray, setS3FolderNameAarray] = useState<Record<string, string[]>>({});
    const [s3FolderOptions, setS3FolderOptions] = useState<IOption[]>([]);
    const [yearOptions, setYearOptions] = useState<IOption[]>([]);
    const [initialAssetS3FolderData, setInitialAssetS3FolderData] = useState<InitialAsssetS3FolderData | null>(null);

    useEffect(() => {
        if (assetS3Folders.length !== 0) {
            const orgArray = findOrgArray(assetS3Folders);
            setOrgOptions(convertArrayToOptions(orgArray));
            const groupArray = findGroupArray(assetS3Folders);
            setGroupArray(groupArray);
            const orgAcronym = assetS3Folders[0].orgAcronym;
            const groupsForOrgSelected = groupArray[orgAcronym];
            setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
            const assetNameArray = findAssetNameArray(assetS3Folders);
            setAssetNameArray(assetNameArray);
            const groupAcronym = assetS3Folders[0].groupAcronym;
            const assetsForGroupSelected = assetNameArray[groupAcronym];
            setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
            const assetName = `Asset_${assetS3Folders[0].assetUid}`
            const assetDescription = assetS3Folders[0].assetDescription;
            setAssetDescription(assetDescription);
            const s3FolderNameArray = findS3FolderNameArray(assetS3Folders);
            setS3FolderNameAarray(s3FolderNameArray);
            const s3FolderNameForAssetNameSelected = s3FolderNameArray[assetName];
            setS3FolderOptions(convertArrayToOptions(s3FolderNameForAssetNameSelected));
            const s3FolderName = assetS3Folders[0].s3Folder;
            const yearArray = findYearArray(assetS3Folders, assetName, s3FolderName);
            setYearOptions(convertArrayToOptions(yearArray))
            const year = assetS3Folders[0].years[0];
            const initialAssetS3FolderData = {
                orgAcronym,
                groupAcronym,
                assetName,
                assetDescription,
                s3FolderName,
                year
            };
            setInitialAssetS3FolderData(initialAssetS3FolderData);
        }
    }, [assetS3Folders]);


    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        history.push("/");
    };

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupsForOrgSelected[0]);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assetS3Folders, assetName);
        setAssetDescription(assetDescription);
        const s3FolderNameForAssetNameSelected = s3FolderNameArray[assetName];
        setS3FolderOptions(convertArrayToOptions(s3FolderNameForAssetNameSelected));
        const s3FolderName = s3FolderNameForAssetNameSelected[0];
        formik.setFieldValue("s3FolderName", s3FolderName);
        const yearArray = findYearArray(assetS3Folders, assetName, s3FolderName);
        setYearOptions(convertArrayToOptions(yearArray));
        const year = yearArray[0];
        formik.setFieldValue("year", year);
    }

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assetS3Folders, assetName);
        setAssetDescription(assetDescription);
        const s3FolderNameForAssetNameSelected = s3FolderNameArray[assetName];
        setS3FolderOptions(convertArrayToOptions(s3FolderNameForAssetNameSelected));
        const s3FolderName = s3FolderNameForAssetNameSelected[0];
        formik.setFieldValue("s3FolderName", s3FolderName);
        const yearArray = findYearArray(assetS3Folders, assetName, s3FolderName);
        setYearOptions(convertArrayToOptions(yearArray));
        const year = yearArray[0];
        formik.setFieldValue("year", year);
    }

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName)
        const assetDescription = findAssetDescription(assetS3Folders, assetName);
        setAssetDescription(assetDescription);
        const s3FolderNameForAssetNameSelected = s3FolderNameArray[assetName];
        setS3FolderOptions(convertArrayToOptions(s3FolderNameForAssetNameSelected));
        const s3FolderName = s3FolderNameForAssetNameSelected[0];
        formik.setFieldValue("s3FolderName", s3FolderName);
        const yearArray = findYearArray(assetS3Folders, assetName, s3FolderName);
        setYearOptions(convertArrayToOptions(yearArray));
        const year = yearArray[0];
        formik.setFieldValue("year", year);
    }

    const handleChangeS3Folder = (e: { value: string }, formik: FormikType) => {
        const s3FolderName = e.value;
        const assetName = formik.values.assetName;
        const assetDescription = findAssetDescription(assetS3Folders, assetName);
        setAssetDescription(assetDescription);
        const yearArray = findYearArray(assetS3Folders, assetName, s3FolderName);
        setYearOptions(convertArrayToOptions(yearArray));
        const year = yearArray[0];
        formik.setFieldValue("year", year);
    }

    const handleDownloadSubmit = (values: any, actions: any) => {
        setIsSubmitting(true);
        const orgAcronym = values.orgAcronym;
        const groupAcronym = values.groupAcronym;
        const assetName = values.assetName;
        const s3FolderName = values.s3FolderName;
        const year = values.year;

        const assetS3FolderSelected = findAssetS3FolderSelected(
            assetS3Folders,
            orgAcronym,
            groupAcronym,
            assetName,
            s3FolderName
        );
        const groupId = assetS3FolderSelected.groupId;
        const assetId = assetS3FolderSelected.assetId;

        const urlBase = `${protocol}://${domainName}/admin_api`;
        const urlBaseGetToken = `${urlBase}/asset_s3_storage_token`;
        const urlGetToken = `${urlBaseGetToken}/${groupId}/${assetId}/${s3FolderName}/${year}`;
        const config = axiosAuth(accessToken);
        const fileName = `${s3FolderName.replace(/ /g, "_").toLowerCase()}_${year}.zip`;

        getAxiosInstance(refreshToken, authDispatch)
            .get(urlGetToken, config)
            .then((response) => {
                setIsSubmitting(true);
                const token = response.data;
                const urlBaseDownload = `${urlBase}/asset_s3_storage_download`;
                const urlDownload = `${urlBaseDownload}/${groupId}/${assetId}/${s3FolderName}/${year}/${token}`;
                var tempLink = document.createElement('a');
                tempLink.style.display = 'none';
                tempLink.href = urlDownload;
                tempLink.setAttribute('download', fileName);
                if (typeof tempLink.download === 'undefined') {
                    tempLink.setAttribute('target', '_blank');
                }
                document.body.appendChild(tempLink);
                tempLink.click();
                setTimeout(function () {
                    document.body.removeChild(tempLink);
                }, 200);
                const message = "Asset data in S3 bucket download successfully.";
                toast.success(message);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
            })
            .finally(() => {
                setIsSubmitting(false);
            })

    }

    return (
        <>
            {
                initialAssetS3FolderData ?
                    <>
                        <FormTitle isSubmitting={isSubmitting}>Select S3 folder</FormTitle>
                        <FormContainer>
                            <Formik
                                initialValues={initialAssetS3FolderData as InitialAsssetS3FolderData}
                                onSubmit={handleDownloadSubmit} >
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
                                                    control='select'
                                                    label='Select group'
                                                    name='groupAcronym'
                                                    type='text'
                                                    options={groupOptions}
                                                    onChange={(e) => handleChangeGroup(e, formik)}
                                                />
                                                <FormikControl
                                                    control='select'
                                                    label='Select asset'
                                                    name='assetName'
                                                    type='text'
                                                    options={assetNameOptions}
                                                    onChange={(e) => handleChangeAsset(e, formik)}
                                                />
                                                <FieldContainer>
                                                    <label>Asset description</label>
                                                    <div>{assetDescription}</div>
                                                </FieldContainer>
                                                <FormikControl
                                                    control='select'
                                                    label='Select S3 folder'
                                                    name='s3FolderName'
                                                    type='text'
                                                    options={s3FolderOptions}
                                                    onChange={(e) => handleChangeS3Folder(e, formik)}
                                                />
                                                <FormikControl
                                                    control='select'
                                                    label='Select year'
                                                    name='year'
                                                    type='text'
                                                    options={yearOptions}
                                                />
                                            </ControlsContainer>
                                            <S3StorageFormButtons onCancel={onCancel} isSubmitting={isSubmitting} />
                                        </Form>
                                    )
                                }
                            </Formik>
                        </FormContainer>
                    </>
                    :
                    <NoDataContainer>
                        No data
                    </NoDataContainer >
            }
        </>
    )
}

export default S3StorageForm;
