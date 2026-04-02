import { FC, useState, SyntheticEvent, useEffect } from "react";
import styled from "styled-components";
import { Formik, Form, FormikProps } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { IOption, axiosAuth, convertArrayToOptions, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { ASSET_S3_FOLDER_OPTIONS } from "../Utils/platformAssistantOptions";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import {
    useAssetsTable,
    useGroupsManagedTable,
    useOrgsOfGroupsManagedTable,
} from "../../../contexts/platformAssistantContext";
import { IAsset } from "../TableColumns/assetsColumns";
import { AxiosError, AxiosResponse } from "axios";
import { setAssetS3FolderOptionToShow, useAssetS3FolderDispatch } from "../../../contexts/assetS3FolderOptions";

// CodeMirror imports
import CodeMirror, { keymap } from "@uiw/react-codemirror";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { CodeMirrorWrapper } from "../../Tools/CodeMirrorWrapper";
import { ControlsContainer, DraggableFormContainer, FieldErrorScroller } from "../../Tools/FormTools";
import { ReIndentCommand } from "../DigitalTwin3DViewer/Pipeline/types";

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

const domainName = getDomainName();
const protocol = getProtocol();

const findOrgArray = (assetsManaged: IAsset[], orgsOfGroupManaged: IOrgOfGroupsManaged[]): string[] => {
    const orgArray: string[] = [];
    for (const asset of assetsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter((org) => org.id === asset.orgId)[0].acronym;
        if (orgArray.indexOf(orgAcronym) === -1) {
            orgArray.push(orgAcronym);
        }
    }
    return orgArray;
};

const findGroupArray = (
    assetsManaged: IAsset[],
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[],
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {};
    for (const asset of assetsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter((org) => org.id === asset.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        const groupAcronym = groupsManaged.filter((group) => group.id === asset.groupId)[0].acronym;
        if (groupArray[orgAcronym].indexOf(groupAcronym) === -1) {
            groupArray[orgAcronym].push(groupAcronym);
        }
    }
    return groupArray;
};

const findAssetNameArray = (assetsManaged: IAsset[], groupsManaged: IGroupManaged[]): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {};
    for (const asset of assetsManaged) {
        const groupAcronym = groupsManaged.filter((group) => group.id === asset.groupId)[0].acronym;
        if (assetArray[groupAcronym] === undefined) {
            assetArray[groupAcronym] = [];
        }
        const assetName = `Asset_${asset.assetUid}`;
        if (assetArray[groupAcronym].indexOf(assetName) === -1) {
            assetArray[groupAcronym].push(assetName);
        }
    }
    return assetArray;
};

const findAssetDescription = (assetsManaged: IAsset[], assetName: string): string => {
    const assetManaged = assetsManaged.filter((asset) => `Asset_${asset.assetUid}` === assetName)[0];
    return assetManaged.description;
};

interface InitialAssetS3FolderData {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    assetDescription: string;
    folderName: string;
    parquetSchema: string;
}

type FormikType = FormikProps<InitialAssetS3FolderData>;

interface CreateAssetS3FolderProps {
    backToTable: () => void;
    refreshAssetS3Folders: () => void;
}

const initialParquetSchema = {
    fields: [
        {
            name: "timestamp",
            type: "TIMESTAMP_MILLIS",
            required: true,
            unit: "ms",
            description: "Timestamp of the measurement in milliseconds since Unix epoch",
        },
        {
            name: "sensorName",
            type: "UTF8",
            required: true,
            description: "Unique identifier name of the sensor",
        },
        {
            name: "sensorVersion",
            type: "INT32",
            required: false,
            description: "Firmware or schema version of the sensor",
        },
        {
            name: "temperature",
            type: "DOUBLE",
            required: true,
            unit: "celsius",
            description: "Temperature reading captured by the sensor",
        },
    ],
};

const CreateAssetS3Folder: FC<CreateAssetS3FolderProps> = ({ backToTable, refreshAssetS3Folders }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const orgsOfGroupManaged = useOrgsOfGroupsManagedTable();
    const groupsManaged = useGroupsManagedTable();
    const assets = useAssetsTable();
    const assetS3FolderDispatch = useAssetS3FolderDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>("");
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter((group) => group.orgId === initOrg.id)[0];
    const initAsset = assets.filter((asset) => asset.groupId === initGroup.id)[0];
    const initAssetName = `Asset_${initAsset.assetUid}`;

    const initialSensorData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        assetName: initAssetName,
        assetDescription: initAsset.description,
        folderName: "telemetry",
        parquetSchema: JSON.stringify(initialParquetSchema, null, 4),
    };

    useEffect(() => {
        const orgArray = findOrgArray(assets, orgsOfGroupManaged);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(assets, orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = initOrg.acronym;
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const assetNameArray = findAssetNameArray(assets, groupsManaged);
        setAssetNameArray(assetNameArray);
        const groupAcronym = initGroup.acronym;
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = `Asset_${initAsset.assetUid}`;
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    }, [assets, groupsManaged, initAsset.assetUid, initGroup.acronym, initOrg.acronym, orgsOfGroupManaged]);

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
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    };

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    };

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    };

    const onSubmit = (values: any, actions: any) => {
        const groupId = groupsManaged.filter((group) => group.acronym === values.groupAcronym)[0].id;
        const assetName = values.assetName;
        const assetId = assets.filter((asset) => asset.assetUid === assetName.slice(6))[0].id;
        const url = `${protocol}://${domainName}/admin_api/asset_s3_folder/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);
        const assetS3FolderData = {
            folderName: values.folderName,
            parquetSchema: values.parquetSchema,
        };

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, assetS3FolderData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const assetS3FolderOptionToShow = { assetS3FolderOptionToShow: ASSET_S3_FOLDER_OPTIONS.TABLE };
                setIsSubmitting(false);
                setAssetS3FolderOptionToShow(assetS3FolderDispatch, assetS3FolderOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshAssetS3Folders();
            });
    };

    const validationSchema = Yup.object().shape({
        folderName: Yup.string().max(100, "The maximum number of characters allowed is 100").required("Required"),
        parquetSchema: Yup.string()
            .required("Required")
            .test("valid-json", "Invalid JSON format", (value) => {
                if (!value) return false;
                try {
                    JSON.parse(value);
                    return true;
                } catch {
                    return false;
                }
            }),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create S3 Folder</FormTitle>
            <DraggableFormContainer>
                <Formik initialValues={initialSensorData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => (
                        <Form>
                            <ControlsContainer>
                                <FormikControl
                                    control="select"
                                    label="Select org"
                                    name="orgAcronym"
                                    type="text"
                                    options={orgOptions}
                                    onChange={(e) => handleChangeOrg(e, formik)}
                                />
                                <FormikControl
                                    control="select"
                                    label="Select group"
                                    name="groupAcronym"
                                    type="text"
                                    options={groupOptions}
                                    onChange={(e) => handleChangeGroup(e, formik)}
                                />
                                <FormikControl
                                    control="select"
                                    label="Select asset"
                                    name="assetName"
                                    type="text"
                                    options={assetNameOptions}
                                    onChange={(e) => handleChangeAsset(e, formik)}
                                />
                                <FieldContainer>
                                    <label>Asset description</label>
                                    <div>{assetDescription}</div>
                                </FieldContainer>
                                <FormikControl control="input" label="Folder name" name="folderName" type="text" />
                                <CodeMirrorWrapper fontSize="14px">
                                    <label>Parquet schema</label>
                                    <div className="cm-wrapper">
                                        <CodeMirror
                                            value={formik.values.parquetSchema}
                                            height="300px"
                                            theme={oneDark}
                                            extensions={[
                                                json(),
                                                indentUnit.of("    "),
                                                indentOnInput(),
                                                keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                                            ]}
                                            onChange={(value) => {
                                                formik.setFieldValue("parquetSchema", value);
                                            }}
                                            onBlur={() => {
                                                formik.setFieldTouched("parquetSchema", true);
                                            }}
                                            basicSetup={{
                                                lineNumbers: true,
                                                foldGutter: true,
                                                bracketMatching: true,
                                                closeBrackets: true,
                                                syntaxHighlighting: true,
                                                autocompletion: true,
                                                tabSize: 4,
                                                searchKeymap: true,
                                            }}
                                        />
                                    </div>
                                    <FieldErrorScroller name="parquetSchema" />
                                </CodeMirrorWrapper>
                            </ControlsContainer>
                            <FormButtonsProps
                                onCancel={onCancel}
                                isValid={formik.isValid}
                                isSubmitting={formik.isSubmitting}
                            />
                        </Form>
                    )}
                </Formik>
            </DraggableFormContainer>
        </>
    );
};

export default CreateAssetS3Folder;
