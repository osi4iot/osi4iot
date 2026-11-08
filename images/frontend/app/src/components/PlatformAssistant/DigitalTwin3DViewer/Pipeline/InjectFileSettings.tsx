// Injection tab of an Inject node with a file (injectFile.ts): the file of this browser and how it is sent.
import { FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { CheckboxInput, FormGroup, Input, Label } from "./types";
import { INJECT_FILE_DEFAULTS, InjectFileSettings, fileKindOf, getInjectFile, mimeTypeOf, sendsAsIs, setInjectFile } from "./injectFile";

const Note = styled.div`
    color: #9a9a9a;
    font-size: 12px;
    margin: -4px 0 12px;
    line-height: 1.45;
`;

const FileBox = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    margin-bottom: 12px;
    border-radius: 6px;
    background-color: #2f3743;
    border: 1px solid #4b5563;
    color: #e5e7eb;
    font-size: 13px;

    & > span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const SmallButton = styled.button`
    flex: none;
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid #4b5563;
    background-color: #374151;
    color: #f9fafb;
    font-size: 12px;
    cursor: pointer;

    &:hover {
        background-color: #4b5563;
    }
`;

const Row = styled.div`
    display: flex;
    gap: 8px;

    & > * {
        flex: 1;
        min-width: 0;
    }
`;

const CheckLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    color: #e5e7eb;
    font-size: 13px;
    margin-bottom: 12px;
    cursor: pointer;
`;

const sizeText = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

const NumberField: FC<{ label: string; value: number | undefined; fallback: number; min: number; max: number; step?: string; onChange: (v: number) => void }> = ({
    label,
    value,
    fallback,
    min,
    max,
    step = "any",
    onChange,
}) => (
    <FormGroup>
        <Label>{label}</Label>
        <Input
            type="number"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={value ?? fallback}
            onChange={(e: { target: { value: string } }) => {
                const v = parseFloat(e.target.value);
                onChange(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
            }}
        />
    </FormGroup>
);

export const InjectFileSettingsEditor: FC<{ nodeUid: string; settings: InjectFileSettings; onChange: (key: string, value: unknown) => void }> = ({
    nodeUid,
    settings,
    onChange,
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [loaded, setLoaded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let alive = true;
        getInjectFile(nodeUid).then((f) => {
            if (!alive) return;
            setFile(f);
            setLoaded(true);
        });
        return () => {
            alive = false;
        };
    }, [nodeUid]);

    const choose = (f: File | null) => {
        if (!f) return;
        const kind = fileKindOf(f);
        if (!kind) {
            window.alert(`${f.name} is not an image, a video nor an audio file.`);
            return;
        }
        setFile(f);
        void setInjectFile(nodeUid, f);
        onChange("fileName", f.name);
        onChange("fileKind", kind);
    };

    const kind = file ? fileKindOf(file) : (settings.fileKind ?? null);
    const type = file ? mimeTypeOf(file) : "";

    return (
        <>
            <FormGroup>
                <Label>File</Label>
                <FileBox>
                    <span title={file?.name}>
                        {file
                            ? `${file.name} · ${kind} · ${sizeText(file.size)}`
                            : loaded
                              ? settings.fileName
                                  ? `${settings.fileName}: not in this browser, choose it again`
                                  : "No file"
                              : "…"}
                    </span>
                    <SmallButton type="button" onClick={() => inputRef.current?.click()}>
                        {file ? "Change" : "Choose"}
                    </SmallButton>
                    {file && (
                        <SmallButton
                            type="button"
                            onClick={() => {
                                setFile(null);
                                void setInjectFile(nodeUid, null);
                            }}
                        >
                            Remove
                        </SmallButton>
                    )}
                </FileBox>
                <input
                    ref={inputRef}
                    type="file"
                    aria-label="Inject file"
                    accept="image/*,video/*,audio/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                        choose(e.target.files?.[0] ?? null);
                        e.target.value = "";
                    }}
                />
            </FormGroup>
            <Note>
                The file stays in this browser, not in the pipeline: on another computer choose it again. It reaches the pipeline as the
                mobile sensors send to dev2dtm, so the nodes after a Listen on dev2dtm work the same.
            </Note>

            {kind === "image" && (
                <>
                    <Note>One message with the image{file && !sendsAsIs("image", type, file.size) ? ", converted to JPEG" : ""}.</Note>
                    {file && !sendsAsIs("image", type, file.size) && (
                        <NumberField label="Largest side (px)" value={settings.maxSide} fallback={INJECT_FILE_DEFAULTS.maxSide} min={64} max={8192} step="1" onChange={(v) => onChange("maxSide", Math.round(v))} />
                    )}
                </>
            )}

            {kind === "video" && (
                <>
                    <Row>
                        <NumberField label="Frames per second" value={settings.fps} fallback={INJECT_FILE_DEFAULTS.fps} min={0.1} max={30} onChange={(v) => onChange("fps", v)} />
                        <NumberField label="Speed (×)" value={settings.speed} fallback={INJECT_FILE_DEFAULTS.speed} min={0.05} max={8} onChange={(v) => onChange("speed", v)} />
                    </Row>
                    <Row>
                        <NumberField label="JPEG quality (0.1–1)" value={settings.jpegQuality} fallback={INJECT_FILE_DEFAULTS.jpegQuality} min={0.1} max={1} onChange={(v) => onChange("jpegQuality", v)} />
                        <NumberField label="Largest side (px)" value={settings.maxSide} fallback={INJECT_FILE_DEFAULTS.maxSide} min={64} max={4096} step="1" onChange={(v) => onChange("maxSide", Math.round(v))} />
                    </Row>
                    <CheckLabel>
                        <CheckboxInput type="checkbox" checked={!!settings.loop} onChange={(e: { target: { checked: boolean } }) => onChange("loop", e.target.checked)} />
                        Loop until stopped
                    </CheckLabel>
                    <Note>
                        One JPEG per frame, like the Mobile video sensor; each frame&apos;s timestamp is its time in the video. Speed 0.5 sends
                        them at half the pace (a slow pipeline does not fall behind) with the same timestamps. Press the node&apos;s button again
                        to stop.
                    </Note>
                </>
            )}

            {kind === "audio" && (
                <>
                    {file && sendsAsIs("audio", type, file.size) ? (
                        <Note>One message with the clip, as the Mobile audio sensor sends it.</Note>
                    ) : (
                        <>
                            <Row>
                                <NumberField label="Segment (s)" value={settings.audioSegmentSeconds} fallback={INJECT_FILE_DEFAULTS.audioSegmentSeconds} min={1} max={28} step="1" onChange={(v) => onChange("audioSegmentSeconds", Math.round(v))} />
                            </Row>
                            <CheckLabel>
                                <CheckboxInput
                                    type="checkbox"
                                    checked={settings.audioRealtime ?? INJECT_FILE_DEFAULTS.audioRealtime}
                                    onChange={(e: { target: { checked: boolean } }) => onChange("audioRealtime", e.target.checked)}
                                />
                                At the pace of the recording
                            </CheckLabel>
                            <Note>
                                Larger than a message (900 kB) or of a type the pipeline does not read: it is sent as 16 kHz mono WAV segments
                                (the Transcriptor reads them), with payload.segment and payload.segments.
                            </Note>
                        </>
                    )}
                </>
            )}
        </>
    );
};
