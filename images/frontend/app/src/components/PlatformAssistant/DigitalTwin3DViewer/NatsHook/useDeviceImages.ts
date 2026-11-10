// The images that the devices of the asset send to the digital twin (its topics dev2dtm_1, dev2dtm_2...), for the
// Image panels that show them. The viewer does not listen to the device topics otherwise (see filterNatsSubject):
// it subscribes only to those some Image panel shows, and only takes their images (Content-Type image/...);
// the rest (audio, JSON) is for the pipelines.
import { useEffect } from "react";
import { type NatsConnection } from "@nats-io/nats-core";
import { INatsSubjectData } from "../Main/Model";
import { mqttTopicToNatsSubject } from "./tools";

export const deviceImageSubjects = (natsSubjectsData: INatsSubjectData[], refs: string[]): { ref: string; subject: string }[] =>
    refs.flatMap((ref) => {
        const data = natsSubjectsData.find((d) => d.topicRef === ref && d.natsSubject && !d.natsSubject.startsWith("Warning"));
        return data ? [{ ref, subject: mqttTopicToNatsSubject(data.natsSubject) }] : [];
    });

const useDeviceImages = (
    natsClient: NatsConnection | null,
    natsSubjectsData: INatsSubjectData[],
    // the device topics shown (dev2dtm_n)
    refs: string[],
    onImage: (imageBytes: Uint8Array, mimeType: string, topicRef?: string) => void,
) => {
    const key = deviceImageSubjects(natsSubjectsData, refs)
        .map(({ ref, subject }) => `${ref}=${subject}`)
        .join("|");

    useEffect(() => {
        if (!natsClient || !key) return;
        const subscriptions = key.split("|").map((pair) => {
            const [ref, subject] = pair.split("=");
            const sub = natsClient.subscribe(subject);
            (async () => {
                for await (const msg of sub) {
                    const contentType = msg.headers?.get("Content-Type") ?? "";
                    if (contentType.startsWith("image/")) onImage(msg.data, contentType, ref);
                }
            })().catch(() => undefined);
            return sub;
        });
        return () => subscriptions.forEach((sub) => sub.unsubscribe());
    }, [natsClient, key, onImage]);
};

export default useDeviceImages;
