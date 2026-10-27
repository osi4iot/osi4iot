import { FC, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { scrollbarStyle } from "../../Tools/FormTools";
import { AxiosError, AxiosResponse } from "axios";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { IKnowledgeFile } from "../TableColumns/knowledgeColumns";
import { FormSection } from "../../Tools/FormTools";

// Which documents of its group's knowledge base a digital twin's AI agents
// may read and search: none unless chosen here. They are shown by title
// (the file name when there is none), as set in Group admin → Knowledge.

const domainName = getDomainName();
const protocol = getProtocol();

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
    font-size: 14px;
`;

const InfoText = styled.span`
    color: #c9c9c9;
`;

const FilterInput = styled.input`
    background-color: #0c0d0f;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 14px;
    outline: none;

    &:focus {
        border: 1px solid #3274d9;
    }
`;

const DocumentList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 5px;
    ${scrollbarStyle}
`;

const DocumentOption = styled.label`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;

    & input {
        margin-top: 3px;
        cursor: pointer;
    }
`;

const DocumentTitle = styled.span`
    color: white;
`;

const DocumentFileName = styled.span`
    color: #8e8e8e;
    font-size: 12px;
    margin-left: 6px;
`;

const Actions = styled.div`
    display: flex;
    gap: 15px;
    color: #3274d9;

    & span {
        cursor: pointer;
    }
`;

// More documents than this: a filter box is shown.
const FILTER_FROM = 8;

interface KnowledgeDocumentsSelectorProps {
    groupId: number | null;
    // The knowledge base is enabled for the organization and the group.
    ragEnabled: boolean;
    selected: string[];
    onChange: (fileNames: string[]) => void;
}

const KnowledgeDocumentsSelector: FC<KnowledgeDocumentsSelectorProps> = ({ groupId, ragEnabled, selected, onChange }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [documents, setDocuments] = useState<IKnowledgeFile[] | null>(null);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        setDocuments(null);
        setFilter("");
        if (groupId === null || !ragEnabled) return;
        const url = `${protocol}://${domainName}/admin_api/group_knowledge_file_list/${groupId}`;
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, axiosAuth(accessToken))
            .then((response: AxiosResponse<IKnowledgeFile[]>) => setDocuments(response.data))
            .catch((error: AxiosError) => {
                setDocuments([]);
                axiosErrorHandler(error, authDispatch);
            });
    }, [accessToken, refreshToken, authDispatch, groupId, ragEnabled]);

    const sorted = useMemo(
        () =>
            (documents || [])
                .map((doc) => ({ fileName: doc.fileName, title: doc.title || doc.fileName }))
                .sort((a, b) => a.title.localeCompare(b.title) || a.fileName.localeCompare(b.fileName)),
        [documents],
    );

    const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        if (!needle) return sorted;
        return sorted.filter(
            (doc) => doc.title.toLowerCase().includes(needle) || doc.fileName.toLowerCase().includes(needle),
        );
    }, [sorted, filter]);

    // Chosen documents that are no longer in the knowledge base are not
    // shown (admin_api has removed them from the digital twin).
    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const numSelected = sorted.filter((doc) => selectedSet.has(doc.fileName)).length;

    const toggle = (fileName: string) => {
        if (selectedSet.has(fileName)) onChange(selected.filter((name) => name !== fileName));
        else onChange([...selected, fileName]);
    };

    let content;
    if (!ragEnabled) {
        content = (
            <InfoText>
                The knowledge base is not enabled for this group (it must be enabled for its organization and for the
                group).
            </InfoText>
        );
    } else if (documents === null) {
        content = <InfoText>Loading the documents…</InfoText>;
    } else if (sorted.length === 0) {
        content = <InfoText>The group's knowledge base has no documents (Group admin → Knowledge).</InfoText>;
    } else {
        content = (
            <>
                <InfoText>
                    The AI agents of this digital twin can read and search the documents chosen here, and no others.{" "}
                    {numSelected} of {sorted.length} chosen.
                </InfoText>
                {sorted.length > FILTER_FROM && (
                    <FilterInput placeholder="Filter by title" value={filter} onChange={(e) => setFilter(e.target.value)} />
                )}
                <Actions>
                    <span onClick={() => onChange(Array.from(new Set([...selected, ...visible.map((d) => d.fileName)])))}>
                        Select all
                    </span>
                    <span
                        onClick={() => {
                            const shown = new Set(visible.map((d) => d.fileName));
                            onChange(selected.filter((name) => !shown.has(name)));
                        }}
                    >
                        Select none
                    </span>
                </Actions>
                <DocumentList>
                    {visible.map((doc) => (
                        <DocumentOption key={doc.fileName}>
                            <input
                                type="checkbox"
                                checked={selectedSet.has(doc.fileName)}
                                onChange={() => toggle(doc.fileName)}
                            />
                            <span>
                                <DocumentTitle>{doc.title}</DocumentTitle>
                                {doc.title !== doc.fileName && <DocumentFileName>{doc.fileName}</DocumentFileName>}
                            </span>
                        </DocumentOption>
                    ))}
                </DocumentList>
            </>
        );
    }

    return (
        <FormSection title="Knowledge base documents">
            <Container>{content}</Container>
        </FormSection>
    );
};

export default KnowledgeDocumentsSelector;
