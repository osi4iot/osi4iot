// HelpTab.tsx
import { useState, useCallback } from "react";
import { NODE_HELP } from "./nodeHelp";
import {
    HelpSection,
    HelpDescription,
    HelpExampleBlock,
    HelpExampleLabel,
    HelpExampleCode,
    CopyButton,
    HelpNotesList,
    HelpNotesItem,
    TabContent,
    HelpParamDesc,
    HelpParamName,
    HelpParamRow,
    HelpExampleCodeWrapper,
} from "./types";
import { Check, Copy } from "lucide-react";

function CopyableCode({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [code]);

    return (
        <HelpExampleCodeWrapper>
            <CopyButton copied={copied} onClick={handleCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
            </CopyButton>
            <HelpExampleCode>{code}</HelpExampleCode>
        </HelpExampleCodeWrapper>
    );
}

export function HelpTab({ nodeType }: { nodeType: string }) {
    const help = NODE_HELP[nodeType];

    if (!help) {
        return (
            <TabContent>
                <HelpDescription>No help available for this node type.</HelpDescription>
            </TabContent>
        );
    }

    return (
        <TabContent>
            <HelpSection>
                <HelpExampleLabel>Description</HelpExampleLabel>
                <HelpDescription>{help.description}</HelpDescription>
            </HelpSection>
            {help.details && (
                <HelpSection>
                    <HelpExampleLabel>Details</HelpExampleLabel>
                    {help.details.split("\n\n").map((paragraph, i) => (
                        <HelpDescription key={i}>{paragraph}</HelpDescription>
                    ))}
                </HelpSection>
            )}
            {help.params && help.params.length > 0 && (
                <HelpSection>
                    <HelpExampleLabel>Parameters</HelpExampleLabel>
                    {help.params.map((p) => (
                        <HelpParamRow key={p.name}>
                            <HelpParamName>{p.name}</HelpParamName>
                            <HelpParamDesc>{p.description}</HelpParamDesc>
                        </HelpParamRow>
                    ))}
                </HelpSection>
            )}
            {help.inputExamples && help.inputExamples.length > 0 && (
                <HelpSection>
                    {help.inputExamples.map((ex) => (
                        <HelpExampleBlock key={ex.label}>
                            <HelpExampleLabel>{ex.label}</HelpExampleLabel>
                            <CopyableCode code={ex.code} />
                        </HelpExampleBlock>
                    ))}
                </HelpSection>
            )}
            {help.outputExamples && help.outputExamples.length > 0 && (
                <HelpSection>
                    {help.outputExamples.map((ex) => (
                        <HelpExampleBlock key={ex.label}>
                            <HelpExampleLabel>{ex.label}</HelpExampleLabel>
                            <CopyableCode code={ex.code} />
                        </HelpExampleBlock>
                    ))}
                </HelpSection>
            )}
            {help.notes && help.notes.length > 0 && (
                <HelpSection>
                    <HelpExampleLabel>Notes</HelpExampleLabel>
                    <HelpNotesList>
                        {help.notes.map((note, i) => (
                            <HelpNotesItem key={i}>{note}</HelpNotesItem>
                        ))}
                    </HelpNotesList>
                </HelpSection>
            )}
        </TabContent>
    );
}
