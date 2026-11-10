// The source of an Image panel: all the images, the pipeline's (dtm2sim), a device topic of the asset
// (dev2dtm_1, dev2dtm_2...: the number is typed, the asset's are offered) or any other topic reference typed.
// A device topic that the asset does not have (yet) is accepted: the panel shows its images when they arrive.
import { FC, useEffect, useId, useState } from "react";
import styled from "styled-components";
import { ANY_IMAGE_SOURCE, DEVICE_IMAGE_SOURCE, ImageSourceOption, isImageSource } from "./workspaceLayout";

const DEVICE = "dev2dtm";
const OTHER = "other";

const Row = styled.div<{ $compact: boolean }>`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;

    select,
    input {
        height: ${({ $compact }) => ($compact ? "30px" : "36px")};
        box-sizing: border-box;
        padding: 0 10px;
        background: #0e1013;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #e6e8eb;
        font-size: 13px;
    }
    select {
        flex: 1 1 200px;
        min-width: 0;
    }
    input[aria-invalid="true"] {
        border-color: #f2495c;
    }
`;

const Prefix = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #9aa1aa;
    font-size: 13px;

    input {
        width: 64px;
    }
`;

const Note = styled.p<{ $error?: boolean }>`
    margin: 6px 0 0;
    font-size: 12px;
    color: ${({ $error }) => ($error ? "#ff7383" : "#9aa1aa")};
`;

export interface ImageSourceFieldProps {
    value: string;
    // the sources offered (imageSourceOptions)
    options: ImageSourceOption[];
    // the source chosen or typed (null while what is typed is not valid)
    onChange: (source: string | null) => void;
    // smaller, for the bar of a panel being edited
    compact?: boolean;
    label?: string;
}

const kindOf = (value: string, options: ImageSourceOption[]) =>
    DEVICE_IMAGE_SOURCE.test(value) ? DEVICE : options.some((o) => o.value === value) ? value : OTHER;

const ImageSourceField: FC<ImageSourceFieldProps> = ({ value, options, onChange, compact = false, label = "Source" }) => {
    const id = useId();
    const [kind, setKind] = useState(() => kindOf(value, options));
    const [number, setNumber] = useState(DEVICE_IMAGE_SOURCE.test(value) ? value.split("_")[1] : "1");
    const [other, setOther] = useState(kindOf(value, options) === OTHER ? value : "");
    useEffect(() => {
        // the value changed from outside (another panel, undo...)
        setKind(kindOf(value, options));
        if (DEVICE_IMAGE_SOURCE.test(value)) setNumber(value.split("_")[1]);
        else if (kindOf(value, options) === OTHER) setOther(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const devices = options
        .filter((o) => DEVICE_IMAGE_SOURCE.test(o.value))
        .sort((a, b) => Number(a.value.split("_")[1]) - Number(b.value.split("_")[1]));
    const rest = options.filter((o) => !DEVICE_IMAGE_SOURCE.test(o.value));
    const numberOk = /^\d{1,4}$/.test(number) && Number(number) > 0;
    const otherOk = isImageSource(other.trim()) && other.trim() !== ANY_IMAGE_SOURCE;
    const device = `${DEVICE}_${Number(number)}`;
    const deviceKnown = devices.find((o) => o.value === device);

    const pickKind = (next: string) => {
        setKind(next);
        if (next === DEVICE) {
            const first = numberOk ? device : devices[0]?.value ?? `${DEVICE}_1`;
            setNumber(first.split("_")[1]);
            onChange(first);
        } else if (next === OTHER) {
            onChange(otherOk ? other.trim() : null);
        } else onChange(next);
    };

    return (
        <div>
            <Row $compact={compact}>
                <select aria-label={label} value={kind} onChange={(e) => pickKind(e.target.value)}>
                    {rest.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                            {o.live ? " · receiving images" : ""}
                        </option>
                    ))}
                    <option value={DEVICE}>
                        Device (dev2dtm){devices.some((o) => o.live) ? " · receiving images" : ""}
                    </option>
                    <option value={OTHER}>Other topic…</option>
                </select>
                {kind === DEVICE && (
                    <Prefix>
                        dev2dtm_
                        <input
                            type="text"
                            inputMode="numeric"
                            aria-label="Number of the device topic"
                            list={devices.length ? `${id}-devices` : undefined}
                            value={number}
                            aria-invalid={!numberOk}
                            style={{ width: 72, flex: "none" }}
                            onChange={(e) => {
                                const n = e.target.value.replace(/^dev2dtm_/, "").trim();
                                setNumber(n);
                                onChange(/^\d{1,4}$/.test(n) && Number(n) > 0 ? `${DEVICE}_${Number(n)}` : null);
                            }}
                        />
                        {devices.length > 0 && (
                            <datalist id={`${id}-devices`}>
                                {devices.map((o) => (
                                    <option key={o.value} value={o.value.split("_")[1]}>
                                        {o.value}
                                    </option>
                                ))}
                            </datalist>
                        )}
                    </Prefix>
                )}
                {kind === OTHER && (
                    <input
                        type="text"
                        aria-label="Topic reference"
                        placeholder="e.g. dtm2sim"
                        maxLength={60}
                        value={other}
                        aria-invalid={other !== "" && !otherOk}
                        onChange={(e) => {
                            setOther(e.target.value);
                            const typed = e.target.value.trim();
                            onChange(isImageSource(typed) && typed !== ANY_IMAGE_SOURCE ? typed : null);
                        }}
                        style={{ flex: "1 1 140px", minWidth: 0 }}
                    />
                )}
            </Row>
            {kind === DEVICE && !compact && (
                <Note $error={!numberOk}>
                    {!numberOk
                        ? "The number of the topic: 1, 2, 3…"
                        : devices.length === 0
                          ? "The asset has no device topics (dev2dtm_n) yet: the panel shows the images when they arrive."
                          : deviceKnown
                            ? `The asset's device topics: ${devices.map((o) => o.value + (o.live ? " (receiving)" : "")).join(", ")}.`
                            : `The asset has no ${device} (it has ${devices.map((o) => o.value).join(", ")}): the panel shows its images when they arrive.`}
                </Note>
            )}
            {kind === OTHER && !compact && (
                <Note $error={other !== "" && !otherOk}>
                    {other !== "" && !otherOk ? "Letters, digits, _ . - (up to 60)." : "The reference of a topic of the digital twin (as in its topics)."}
                </Note>
            )}
        </div>
    );
};

export default ImageSourceField;
