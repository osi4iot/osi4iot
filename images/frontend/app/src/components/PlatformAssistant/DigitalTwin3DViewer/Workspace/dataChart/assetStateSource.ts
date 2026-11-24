// The state of the twin's asset (iot_data.assetState.state) as a source of the Data charts: "@assetState", beside the
// topics of the store. It is read (useAssetState) only while a panel of the page uses it, every few seconds, or at
// once when pipelines tells that it changed.
import { useEffect, useMemo, useRef } from "react";
import { LiveListener, LiveMessage, LiveValueStore } from "../liveValues";
import { AssetStateView } from "../assetStatePanel";
import { ASSET_STATE_SOURCE, dataFieldPaths } from "./dataChart";

// the state as a message: its time is that of the state (when it was written), or when it was read
export const assetStateMessage = (view: AssetStateView | null | undefined, readAt = Date.now()): LiveMessage | undefined => {
    if (!view) return undefined;
    const written = view.lastUpdated ? Date.parse(view.lastUpdated) : NaN;
    return {
        payload: view.state ?? {},
        receivedAt: Number.isFinite(written) ? written : readAt,
    };
};

// The store with the asset's state as one more source
export const useWithAssetState = (store: LiveValueStore, view: AssetStateView | null | undefined): LiveValueStore => {
    const message = useRef<LiveMessage | undefined>(undefined);
    const listeners = useRef(new Set<LiveListener>());
    useEffect(() => {
        message.current = assetStateMessage(view);
        if (message.current) listeners.current.forEach((listener) => listener(message.current!));
    }, [view]);
    return useMemo<LiveValueStore>(
        () => ({
            get: (ref) => (ref === ASSET_STATE_SOURCE ? message.current : store.get(ref)),
            fields: (ref) => (ref === ASSET_STATE_SOURCE ? dataFieldPaths(message.current?.payload) : store.fields(ref)),
            subscribe: (ref, listener) => {
                if (ref !== ASSET_STATE_SOURCE) return store.subscribe(ref, listener);
                listeners.current.add(listener);
                return () => {
                    listeners.current.delete(listener);
                };
            },
            publish: store.publish,
        }),
        [store],
    );
};

// The values of a scope's store with the asset's state of another (a store of useWithAssetState): the Data charts of
// a frame of a canvas see the messages of that frame
export const withAssetStateOf = (live: LiveValueStore, withState: LiveValueStore): LiveValueStore => ({
    get: (ref) => (ref === ASSET_STATE_SOURCE ? withState.get(ref) : live.get(ref)),
    fields: (ref) => (ref === ASSET_STATE_SOURCE ? withState.fields(ref) : live.fields(ref)),
    subscribe: (ref, listener) => (ref === ASSET_STATE_SOURCE ? withState.subscribe(ref, listener) : live.subscribe(ref, listener)),
    publish: live.publish,
});
