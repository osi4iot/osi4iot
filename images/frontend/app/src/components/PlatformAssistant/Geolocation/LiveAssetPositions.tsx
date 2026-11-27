import { FC, useEffect, useRef } from "react";
import { useNatsConnection } from "../DigitalTwin3DViewer/Utils/customHooks";
import { StringCodec } from "../../../tools/natsCodec";
import { LivePosition, positionOfMessage } from "./liveAssetPositions";

const sc = StringCodec();

// the markers move at most this often (a phone sends its position every second or so)
const FLUSH_MS = 1000;

interface LiveAssetPositionsProps {
    // the asset of each subject of the geolocation sensors (liveAssetPositions.ts, assetOfSubjects)
    assetOfSubject: Record<string, string>;
    onPositions: (positions: Record<string, LivePosition>) => void;
}

// Subscribes by NATS (the user's session) to the topics of the geolocation sensors and gives the new positions of
// their assets; renders nothing. Mounted only while the map shows assets that move.
const LiveAssetPositions: FC<LiveAssetPositionsProps> = ({ assetOfSubject, onPositions }) => {
    const { natsClient } = useNatsConnection();
    const onPositionsRef = useRef(onPositions);
    onPositionsRef.current = onPositions;
    const subjectsKey = Object.keys(assetOfSubject).sort().join(",");

    useEffect(() => {
        if (!natsClient || subjectsKey === "") return;
        const assetOf = { ...assetOfSubject };
        let pending: Record<string, LivePosition> = {};
        let timer: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;
        const flush = () => {
            timer = null;
            if (stopped || Object.keys(pending).length === 0) return;
            const positions = pending;
            pending = {};
            onPositionsRef.current(positions);
        };
        const subscriptions = Object.keys(assetOf).map((subject) => natsClient.subscribe(subject));
        for (const sub of subscriptions) {
            (async () => {
                for await (const msg of sub) {
                    if (stopped) break;
                    const assetUid = assetOf[msg.subject];
                    if (!assetUid) continue;
                    const position = positionOfMessage(sc.decode(msg.data));
                    if (!position) continue;
                    pending[assetUid] = position;
                    if (timer === null) timer = setTimeout(flush, FLUSH_MS);
                }
            })().catch(() => undefined);
        }
        return () => {
            stopped = true;
            if (timer !== null) clearTimeout(timer);
            for (const sub of subscriptions) sub.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [natsClient, subjectsKey]);

    return null;
};

export default LiveAssetPositions;
