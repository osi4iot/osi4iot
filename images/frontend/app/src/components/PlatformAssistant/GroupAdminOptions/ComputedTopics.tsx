// The topics of an asset for its computed sensors (dtm2pdb_1, dtm2pdb_2…): the values a pipeline computes (power from
// voltage and current, an efficiency, a damage…) and stores in the IoT database with an IoTDB node (Insert). A sensor on
// one of these topics is a computed sensor: its measurements describe what the pipeline stores, and it is charted, has
// its Grafana dashboard and is read by the AI agents like any other sensor.
import { FC, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { reloadTable, useTable } from "../../../state";

export const COMPUTED_TOPIC_REF = /^dtm2pdb_(\d+)$/;

export const isComputedTopicRef = (topicRef: string | undefined): boolean => COMPUTED_TOPIC_REF.test(topicRef ?? "");

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    font-size: 13px;
    color: #c7d0d9;

    .refs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .ref {
        padding: 2px 8px;
        border-radius: 10px;
        background-color: #1f2a37;
        border: 1px solid #2c3235;
        font-family: monospace;
    }

    .help {
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

const byNumber = (a: string, b: string) => Number(a.split("_").pop()) - Number(b.split("_").pop());

const ComputedTopics: FC<{ groupId: number; assetId: number }> = ({ groupId, assetId }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const assetTopics = useTable("assetTopics");
    const [creating, setCreating] = useState(false);
    const refs = assetTopics
        .filter((t) => t.assetId === assetId && isComputedTopicRef(t.topicRef))
        .map((t) => t.topicRef)
        .sort(byNumber);

    const create = () => {
        setCreating(true);
        const url = `${getProtocol()}://${getDomainName()}/admin_api/asset_computed_topic/${groupId}/${assetId}`;
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, {}, axiosAuth(accessToken))
            .then((response: AxiosResponse<{ message: string }>) => {
                toast.success(response.data.message);
                reloadTable("assetTopics");
                reloadTable("topics");
            })
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setCreating(false));
    };

    return (
        <Container data-testid="computed-topics">
            <div className="refs">
                {refs.length === 0 ? <span className="help">None yet.</span> : refs.map((r) => <span className="ref" key={r}>{r}</span>)}
            </div>
            <span className="help">
                Values computed by a pipeline (IoTDB node, Insert) and stored as the measurements of computed sensors: create
                a sensor on one of these topics with the measurements the pipeline writes.
            </span>
            <button type="button" onClick={create} disabled={creating}>
                {creating ? "Creating…" : "Add topic for computed sensors"}
            </button>
        </Container>
    );
};

export default ComputedTopics;
