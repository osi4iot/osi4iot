// What is kept of an asset's states (iot_data.asset_state_history, patroni_metrics): a row at every change of its
// status (OK, Warning, Alarm… whoever writes it: Asset state, Alarm or Machine state nodes), and a copy of the whole
// state at most every so many minutes, taken when the state is written. Both off by default, so that the asset of a
// digital twin used for teaching keeps nothing. The ground of the indicators of availability, MTBF/MTTR and time in
// each status. Editors and administrators of the group set it (admin_api asset_state_history/:groupId/:assetId).
import { FC, useEffect, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError } from "axios";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";

export const SNAPSHOT_MAX_MINUTES = 1440;
// the intervals offered for the copies (0: none)
export const SNAPSHOT_CHOICES = [0, 5, 15, 30, 60, 240, 1440];

export interface AssetStateHistorySettings {
    statusChanges: boolean;
    snapshotMinutes: number;
    rows: number;
    lastRecorded: string | null;
}

export const snapshotLabel = (minutes: number): string =>
    minutes === 0 ? "No copies" : minutes < 60 ? `Every ${minutes} min` : minutes === 60 ? "Every hour" : minutes === 1440 ? "Once a day" : `Every ${minutes / 60} h`;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    font-size: 13px;
    color: #c7d0d9;

    label {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    select {
        background-color: #0b0c0e;
        color: #c7d0d9;
        border: 1px solid #2c3235;
        border-radius: 6px;
        padding: 3px 6px;
        font-size: 13px;
    }

    .help {
        color: #9aa1aa;
        font-size: 12px;
        line-height: 1.4;
    }

    .kept {
        color: #9aa1aa;
        font-size: 12px;
    }

    button {
        align-self: flex-start;
        background-color: #3274d9;
        padding: 5px 10px;
        color: white;
        border: 1px solid #2c3235;
        border-radius: 10px;
        cursor: pointer;
        font-size: 13px;

        &:hover {
            background-color: #2461c0;
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }
`;

const AssetStateHistory: FC<{ groupId: number; assetId: number }> = ({ groupId, assetId }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [stored, setStored] = useState<AssetStateHistorySettings | null>(null);
    const [statusChanges, setStatusChanges] = useState(false);
    const [snapshotMinutes, setSnapshotMinutes] = useState(0);
    const [saving, setSaving] = useState(false);
    const url = `${getProtocol()}://${getDomainName()}/admin_api/asset_state_history/${groupId}/${assetId}`;

    const show = (settings: AssetStateHistorySettings) => {
        setStored(settings);
        setStatusChanges(settings.statusChanges);
        setSnapshotMinutes(settings.snapshotMinutes);
    };

    useEffect(() => {
        let cancelled = false;
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, axiosAuth(accessToken))
            .then((response) => {
                if (!cancelled) show(response.data as AssetStateHistorySettings);
            })
            .catch((error: AxiosError) => {
                if (!cancelled) axiosErrorHandler(error, authDispatch);
            });
        return () => {
            cancelled = true;
        };
    }, [url, accessToken, refreshToken, authDispatch]);

    const changed = !!stored && (stored.statusChanges !== statusChanges || stored.snapshotMinutes !== snapshotMinutes);

    const save = () => {
        setSaving(true);
        getAxiosInstance(refreshToken, authDispatch)
            .put(url, { statusChanges, snapshotMinutes }, axiosAuth(accessToken))
            .then((response) => {
                show(response.data as AssetStateHistorySettings);
                toast.success("State history saved");
            })
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setSaving(false));
    };

    const choices = SNAPSHOT_CHOICES.includes(snapshotMinutes) ? SNAPSHOT_CHOICES : [...SNAPSHOT_CHOICES, snapshotMinutes].sort((a, b) => a - b);

    return (
        <Container data-testid="asset-state-history">
            {stored === null ? (
                <span className="help">Loading…</span>
            ) : (
                <>
                    <label>
                        <input type="checkbox" checked={statusChanges} onChange={(e) => setStatusChanges(e.target.checked)} />
                        Keep every change of status
                    </label>
                    <label>
                        Copy of the whole state
                        <select
                            aria-label="Copy of the whole state"
                            value={snapshotMinutes}
                            onChange={(e) => setSnapshotMinutes(Number(e.target.value))}
                        >
                            {choices.map((m) => (
                                <option key={m} value={m}>
                                    {snapshotLabel(m)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <span className="kept">
                        {stored.rows === 0
                            ? "Nothing kept yet."
                            : `${stored.rows.toLocaleString()} rows kept, the last one ${new Date(stored.lastRecorded ?? "").toLocaleString()}.`}
                    </span>
                    <span className="help">
                        Off by default. The changes of status (from the Asset state, Alarm and Machine state nodes) are the ground
                        of availability, MTBF/MTTR and time in each status; the copies, taken at most that often when the state
                        is written, show how its fields change. Kept 2 years.
                    </span>
                    <button type="button" onClick={save} disabled={!changed || saving}>
                        {saving ? "Saving…" : "Save state history"}
                    </button>
                </>
            )}
        </Container>
    );
};

export default AssetStateHistory;
