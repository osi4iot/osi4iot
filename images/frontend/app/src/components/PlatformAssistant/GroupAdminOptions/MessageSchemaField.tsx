// "Message schema" of the Create topic and Edit topic forms (JSON schema of the messages of the topic).
//
// Only the types written by the user (dev2dtm, dtm2dev, dtm2pdb, inject_N...) have an editor. For the others the
// platform computes it (from the measurements of the sensors, the simulation format of the digital twin, or a fixed
// one): Edit topic shows it read-only and Create topic only says where it will come from.
//
// In Edit topic the version of the schema is shown and, if it has had several, the previous ones can be looked at
// (and, for the editable ones, copied to the editor to go back to them).
import { FC, useEffect, useState } from "react";
import styled from "styled-components";
import { FormikProps } from "formik";
import { AxiosError, AxiosResponse } from "axios";
import CodeMirror, { keymap } from "@uiw/react-codemirror";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { CodeMirrorWrapper } from "../../Tools/CodeMirrorWrapper";
import { FieldErrorScroller } from "../../Tools/FormTools";
import { ReIndentCommand } from "../DigitalTwin3DViewer/Pipeline/types";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { isMessageSchemaEditable, messageSchemaSourceText, messageSchemaText } from "../../../tools/messageSchema";

const domainName = getDomainName();
const protocol = getProtocol();

const LabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;

    label {
        margin-bottom: 0 !important;
    }
`;

const VersionTag = styled.span`
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 8px;
    background: #2c3235;
    color: #c9c9c9;
`;

const Note = styled.div`
    font-size: 12px;
    color: #9aa0a6;
    margin-bottom: 6px;
`;

const VersionRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #9aa0a6;
    margin-bottom: 6px;

    select {
        background: #0c0d0f;
        color: #eee;
        border: 1px solid #2c3235;
        border-radius: 4px;
        padding: 2px 4px;
        font-size: 12px;
    }

    button {
        background: #3274d9;
        color: white;
        border: 1px solid #2c3235;
        border-radius: 6px;
        padding: 2px 10px;
        font-size: 12px;
        cursor: pointer;
    }
`;

interface IMessageSchemaVersion {
    version: number;
    messageSchema: unknown;
    validFrom: string;
    validTo: string | null;
    isCurrent: boolean;
}

interface FormValues {
    topicType: string;
    messageSchema: string;
}

interface MessageSchemaFieldProps {
    formik: FormikProps<any>;
    // Edit topic: the stored topic
    storedTopic?: {
        groupId: number;
        topicId: number;
        topicType: string;
        messageSchema: unknown;
        messageSchemaVersion?: number;
    };
}

const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const MessageSchemaField: FC<MessageSchemaFieldProps> = ({ formik, storedTopic }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const values = formik.values as FormValues;
    const editable = isMessageSchemaEditable(values.topicType);
    const [versions, setVersions] = useState<IMessageSchemaVersion[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

    const groupId = storedTopic?.groupId;
    const topicId = storedTopic?.topicId;
    useEffect(() => {
        if (groupId === undefined || topicId === undefined) return;
        const url = `${protocol}://${domainName}/admin_api/topic_message_schemas/${groupId}/${topicId}`;
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, axiosAuth(accessToken))
            .then((response: AxiosResponse<IMessageSchemaVersion[]>) => {
                setVersions(Array.isArray(response.data) ? response.data : []);
            })
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch));
    }, [groupId, topicId, accessToken, refreshToken, authDispatch]);

    // the type changed in the form: its schema is the one of the new type (computed when saved)
    const sameType = storedTopic !== undefined && storedTopic.topicType === values.topicType;
    const oldVersion = versions.find((item) => item.version === selectedVersion && !item.isCurrent);
    const shownText = oldVersion
        ? messageSchemaText(oldVersion.messageSchema)
        : editable
          ? values.messageSchema
          : messageSchemaText(storedTopic?.messageSchema);
    const showEditor = editable || (sameType && !oldVersion) || oldVersion !== undefined;
    const readOnly = !editable || oldVersion !== undefined;

    return (
        <CodeMirrorWrapper fontSize="14px">
            <LabelRow>
                <label>Message schema</label>
                {sameType && storedTopic?.messageSchemaVersion !== undefined && (
                    <VersionTag title="Version of the message schema">v{storedTopic.messageSchemaVersion}</VersionTag>
                )}
            </LabelRow>
            {!editable && (
                <Note>
                    {messageSchemaSourceText(values.topicType)}
                    {!sameType && " It is computed when the topic is saved."}
                </Note>
            )}
            {sameType && versions.length > 1 && (
                <VersionRow>
                    <span>Version</span>
                    <select
                        value={selectedVersion ?? versions.find((item) => item.isCurrent)?.version ?? ""}
                        onChange={(e) => setSelectedVersion(parseInt(e.target.value, 10))}
                        aria-label="Version of the message schema"
                    >
                        {versions.map((item) => (
                            <option key={item.version} value={item.version}>
                                v{item.version} {item.isCurrent ? "(current)" : `until ${formatDate(item.validTo ?? "")}`}
                            </option>
                        ))}
                    </select>
                    {oldVersion && <span>since {formatDate(oldVersion.validFrom)} (read only)</span>}
                    {oldVersion && editable && (
                        <button
                            type="button"
                            onClick={() => {
                                formik.setFieldValue("messageSchema", messageSchemaText(oldVersion.messageSchema));
                                setSelectedVersion(null);
                            }}
                        >
                            Copy to the editor
                        </button>
                    )}
                </VersionRow>
            )}
            {showEditor && (
                <div className="cm-wrapper">
                    <CodeMirror
                        value={shownText}
                        height="300px"
                        theme={oneDark}
                        readOnly={readOnly}
                        editable={!readOnly}
                        extensions={[
                            json(),
                            indentUnit.of("    "),
                            indentOnInput(),
                            keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
                        ]}
                        onChange={(value) => {
                            if (!readOnly) formik.setFieldValue("messageSchema", value);
                        }}
                        onBlur={() => {
                            if (!readOnly) formik.setFieldTouched("messageSchema", true);
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
            )}
            {editable && <FieldErrorScroller name="messageSchema" />}
        </CodeMirrorWrapper>
    );
};

export default MessageSchemaField;
