import { useEffect, useState } from "react";

interface SpeechSynthesisProps {
    onEnd?: () => void;
}

const useSpeechSynthesis = (props: SpeechSynthesisProps = {}) => {
    const { onEnd = () => {} } = props;
    const [speaking, setSpeaking] = useState(false);
    const [supported, setSupported] = useState(false);

    const handleEnd = () => {
        setSpeaking(false);
        onEnd();
    };

    useEffect(() => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            setSupported(true);
        }
    }, []);

    interface SpeakArgs {
        voice?: SpeechSynthesisVoice | null;
        text?: string;
        rate?: number;
        pitch?: number;
        volume?: number;
    }

    let timer: NodeJS.Timeout | null = null;

    const clear = () => {
        if (timer !== null) clearTimeout(timer);
    };

    const resumeInfinity = (target: SpeechSynthesisUtterance | null) => {
        // prevent memory-leak in case utterance is deleted, while this is ongoing
        if (!target && timer) {
            return clear();
        }

        speechSynthesis.pause();
        speechSynthesis.resume();

        timer = setTimeout(function () {
            resumeInfinity(target);
        }, 10000);
    };

    const isAndroid = /android/i.test(navigator.userAgent);
    const handler = (e: any) => console.debug(e.type);

    const speak = (args: SpeakArgs = {}) => {
         window.speechSynthesis.cancel();
        const { voice = null, text = "", rate = 1, pitch = 1, volume = 1 } = args;
        if (!supported) return;
        setSpeaking(true);
        // Firefox won't repeat an utterance that has been
        // spoken, so we need to create a new instance each time
        const utterance = new window.SpeechSynthesisUtterance();
        utterance.onstart = () => {
            // detection is up to you for this article as
            // this is an own huge topic for itself
            if (!isAndroid) {
                resumeInfinity(utterance);
            }
        };
        utterance.onerror = clear;
        utterance.onend = clear;
        utterance.text = text;
        utterance.voice = voice;
        utterance.onend = handleEnd;
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;
        // SSML markup is rarely supported
        // See: https://www.w3.org/TR/speech-synthesis/
        utterance.onmark = handler;

        // word boundaries are supported by
        // Safari MacOS and on windows but
        // not on Linux and Android browsers
        utterance.onboundary = handler;

        // not supported / fired
        // on many browsers somehow
        utterance.onpause = handler;
        utterance.onresume = handler;
        window.speechSynthesis.speak(utterance);
    };

    const cancel = () => {
        if (!supported) return;
        setSpeaking(false);
        window.speechSynthesis.cancel();
    };

    return {
        supported,
        speak,
        speaking,
        cancel,
    };
};

export default useSpeechSynthesis;
