import { FC, useState } from "react";
import styled from "styled-components";
import { Copy, Eye } from "lucide-react";
import { Column, CellProps } from "../Utils/platformTable";
import DeleteIcon from "../Utils/DeleteIcon";
import EditIcon from "../Utils/EditIcon";
import DownloadFileIcon from "../Utils/DownloadFileIcon";
import DeleteModal from "../../Tools/DeleteModal";
import formatDateString from "../../../tools/formatDate";
import { ISkillSummary, formatSkillSize } from "../Utils/skills";

// The skills of a scope (platform or group), as SkillsContainer lists them.

export interface ISkillRow extends ISkillSummary {
    lastModifiedString: string;
    numFiles: number;
    requiresMcpString: string;
}

interface ISkillColumn extends ISkillRow {
    edit: string;
    duplicate: string;
    download: string;
    delete: string;
}

export const toSkillRows = (skills: ISkillSummary[]): ISkillRow[] =>
    skills.map((skill) => ({
        ...skill,
        lastModifiedString: formatDateString(skill.lastModified),
        numFiles: skill.files.length,
        requiresMcpString: skill.requiresMcp.join(", "),
    }));

export interface ISkillActions {
    // Opens the skill: to edit it, or only to view it when it is read-only
    // (built-in, or another scope's).
    edit: (name: string) => void;
    duplicate: (name: string) => void;
    download: (name: string) => void;
    // Deletes the skill; a skill in use is not deleted (the container asks
    // whether to delete it anyway).
    remove: (name: string, done: () => void) => void;
}

const Description = styled.span`
    white-space: normal;
    display: inline-block;
    min-width: 260px;
`;

const ErrorText = styled.span`
    color: #f2495c;
    white-space: normal;
`;

const Clickable = styled.span`
    cursor: pointer;
`;

const IconButton = styled.span`
    display: flex;
    justify-content: center;
    color: white;
    cursor: pointer;

    &:hover {
        color: #3274d9;
    }
`;

const BuiltinBadge = styled.span`
    margin-left: 8px;
    padding: 1px 6px;
    border: 1px solid #3274d9;
    border-radius: 4px;
    color: #8ab4f8;
    font-size: 11px;
    white-space: nowrap;
`;

const DeleteSkillModal: FC<{ rowIndex: number; name: string; actions: ISkillActions }> = ({
    rowIndex,
    name,
    actions,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const action = (hideModal: () => void) =>
        actions.remove(name, () => {
            setIsSubmitting(false);
            hideModal();
        });
    const [showModal] = DeleteModal(
        "DELETE SKILL",
        `Are you sure to delete the skill ${name}?`,
        "The AI agents that use it will no longer have it.",
        action,
        isSubmitting,
        () => setIsSubmitting(true),
    );
    return <DeleteIcon action={showModal} rowIndex={rowIndex} />;
};

// readOnly: the skills of another scope (the platform's, in a group),
// which can only be viewed, duplicated and downloaded. A built-in skill is
// read-only too.
export const Create_SKILLS_COLUMNS = (actions: ISkillActions, readOnly = false): Column<ISkillColumn>[] => [
    {
        Header: "Name",
        accessor: "name",
        Cell: ({ row, value }: CellProps<ISkillColumn, string>) => (
            <span>
                {value}
                {row.original.builtin && (
                    <BuiltinBadge title="Built-in skill of the platform: read-only">built-in</BuiltinBadge>
                )}
            </span>
        ),
    },
    {
        Header: "Description",
        accessor: "description",
        Cell: ({ value }: CellProps<ISkillColumn, string>) => <Description>{value}</Description>,
    },
    {
        Header: "Version",
        accessor: "version",
    },
    {
        Header: "Requires MCP",
        accessor: "requiresMcpString",
    },
    {
        Header: "Files",
        accessor: "numFiles",
    },
    {
        Header: "Size",
        accessor: "size",
        Cell: ({ value }: CellProps<ISkillColumn, number>) => <span>{formatSkillSize(value)}</span>,
    },
    {
        Header: "Last modified",
        accessor: "lastModifiedString",
    },
    {
        // A SKILL.md that would not load (changed outside the platform).
        Header: "Error",
        accessor: "error",
        Cell: ({ value }: CellProps<ISkillColumn, string>) => <ErrorText title={value}>{value || ""}</ErrorText>,
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }: CellProps<ISkillColumn>) =>
            readOnly || row.original.builtin ? (
                <IconButton title="View" onClick={() => actions.edit(row.original.name)}>
                    <Eye size={18} />
                </IconButton>
            ) : (
                <Clickable title="Edit" onClick={() => actions.edit(row.original.name)}>
                    <EditIcon rowIndex={row.index} />
                </Clickable>
            ),
    },
    {
        Header: "",
        accessor: "duplicate",
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }: CellProps<ISkillColumn>) => (
            <IconButton title="Duplicate: a new skill to adapt" onClick={() => actions.duplicate(row.original.name)}>
                <Copy size={18} />
            </IconButton>
        ),
    },
    {
        Header: "",
        accessor: "download",
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }: CellProps<ISkillColumn>) => (
            <Clickable title="Download as .zip" onClick={() => actions.download(row.original.name)}>
                <DownloadFileIcon rowIndex={row.index} />
            </Clickable>
        ),
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: ({ row }: CellProps<ISkillColumn>) =>
            readOnly || row.original.builtin ? null : (
                <DeleteSkillModal rowIndex={row.index} name={row.original.name} actions={actions} />
            ),
    },
];
