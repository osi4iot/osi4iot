import { FC, useState, SyntheticEvent } from "react";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { ASSET_S3_FOLDER_OPTIONS } from "../Utils/platformAssistantOptions";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import {
    useAssetsTable,
    useGroupsManagedTable,
    useOrgsOfGroupsManagedTable,
} from "../../../contexts/platformAssistantContext";
import { FieldContainer } from "./EditAsset";
import { AxiosResponse, AxiosError } from "axios";
import IAssetS3Folder from "../TableColumns/assetS3FolderColumns";
import {
    setAssetS3FolderOptionToShow,
    useAssetS3FolderDispatch,
    useAssetS3FoldersRowIndexToEdit,
} from "../../../contexts/assetS3FolderOptions";

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

const domainName = getDomainName();
const protocol = getProtocol();

interface EditAssetS3FolderProps {
    assetS3Folders: IAssetS3Folder[];
    backToTable: () => void;
    refreshAssetS3Folders: () => void;
}

const EditAssetS3Folder: FC<EditAssetS3FolderProps> = ({ assetS3Folders, backToTable, refreshAssetS3Folders }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const assetS3FoldersDispatch = useAssetS3FolderDispatch();
    const assetS3FolderRowIndex = useAssetS3FoldersRowIndexToEdit();
    const storedAssetS3Folder = assetS3Folders[assetS3FolderRowIndex];
    const assetId = storedAssetS3Folder.assetId;
    const groupsManaged = useGroupsManagedTable();
    const groupId = storedAssetS3Folder.groupId;
    const group = groupsManaged.filter((groupManaged) => groupManaged.id === groupId)[0];
    const groupAcronym = group.acronym;
    const orgsOfGroupsManaged = useOrgsOfGroupsManagedTable();
    const organization = orgsOfGroupsManaged.filter((org) => org.id === group.orgId)[0];
    const orgAcronym = organization.acronym;
    const assets = useAssetsTable();
    const asset = assets.filter((asset) => asset.id === assetId)[0];
    const assetName = `Asset_${asset.assetUid}`;
    const assetDescription = asset.description;
    const folderName = storedAssetS3Folder.folderName;
    const isCurrent = storedAssetS3Folder.isCurrent;

    const onSubmit = (values: any, actions: any) => {
        if (isCurrent === "No") {
            const message = "Only current asset S3 folder can be edited.";
            toast.error(message);
            backToTable();
            return;
        }
        const url = `${protocol}://${domainName}/admin_api/asset_s3_folder_parquet_schema/${groupId}/${assetId}/${folderName}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const assetS3FolderData = {
            parquetSchema: values.parquetSchema,
        };

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, assetS3FolderData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const assetS3FolderOptionToShow = { assetS3FolderOptionToShow: ASSET_S3_FOLDER_OPTIONS.TABLE };
                setIsSubmitting(false);
                setAssetS3FolderOptionToShow(assetS3FoldersDispatch, assetS3FolderOptionToShow);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshAssetS3Folders();
            });
    };

    const initialAssetS3FolderData = {
        parquetSchema: JSON.stringify(JSON.parse(storedAssetS3Folder.parquetSchema), null, 4),
    };

    const validationSchema = Yup.object().shape({
        parquetSchema: Yup.string().required("Required"),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Edit asset S3 folder</FormTitle>
            <DraggableFormContainer>
                <Formik
                    initialValues={initialAssetS3FolderData}
                    validationSchema={validationSchema}
                    onSubmit={onSubmit}
                >
                    {(formik) => (
                        <Form>
                            <ControlsContainer>
                                <FieldContainer>
                                    <label>Org acronym</label>
                                    <div>{orgAcronym}</div>
                                </FieldContainer>
                                <FieldContainer>
                                    <label>Group acronym</label>
                                    <div>{groupAcronym}</div>
                                </FieldContainer>
                                <FieldContainer>
                                    <label>Asset name</label>
                                    <div>{assetName}</div>
                                </FieldContainer>
                                <FieldContainer>
                                    <label>Asset description</label>
                                    <div>{assetDescription}</div>
                                </FieldContainer>
                                <FieldContainer>
                                    <label>Folder name</label>
                                    <div>{folderName}</div>
                                </FieldContainer>
                                <CodeMirrorWrapper fontSize="14px">
                                    <label>Parquet schema</label>
                                    <div className="cm-wrapper">
                                        <CodeMirror
                                            value={formik.values.parquetSchema}
                                            height="300px"
                                            theme={oneDark}
                                            editable={isCurrent === "Yes"}
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

export default EditAssetS3Folder;
