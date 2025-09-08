import { useCallback, useRef } from "react";

export const useSpeechSynthesis = ({ onEnd }: { onEnd: () => void }) => {
    const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const isPlayingRef = useRef<boolean>(false);

    const speak = useCallback(({ text, voice: voiceLang }: { text: string; voice: string }) => {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech synthesis not supported');
            setTimeout(onEnd, 2000);
            return;
        }

        if (isPlayingRef.current) {
            window.speechSynthesis.cancel();
            setTimeout(() => startSpeech(text, voiceLang), 100);
        } else {
            startSpeech(text, voiceLang);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onEnd]);

    const startSpeech = useCallback((text: string, voiceLang: string) => {
        const utterance = new SpeechSynthesisUtterance(text);
        currentUtteranceRef.current = utterance;
        isPlayingRef.current = true;
        
        utterance.lang = voiceLang;
        
        const voices = window.speechSynthesis.getVoices();
        const appropriateVoice = voices.find(voice => 
            voice.lang.startsWith(voiceLang.split('-')[0]) || 
            voice.lang.includes('es')
        );
        
        if (appropriateVoice) {
            utterance.voice = appropriateVoice;
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // Eventos
        utterance.onend = () => {
            isPlayingRef.current = false;
            currentUtteranceRef.current = null;
            onEnd();
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            isPlayingRef.current = false;
            currentUtteranceRef.current = null;
            
            if (event.error !== 'interrupted') {
                onEnd();
            }
        };

        utterance.onstart = () => {
            //console.log('Speech synthesis started');
        };
        
        // Verificar si speechSynthesis está disponible antes de hablar
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
        
        window.speechSynthesis.speak(utterance);
    }, [onEnd]);

    const cancel = useCallback(() => {
        if ('speechSynthesis' in window) {
            isPlayingRef.current = false;
            currentUtteranceRef.current = null;
            window.speechSynthesis.cancel();
            console.log('Speech synthesis cancelled');
        }
    }, []);

    return { speak, cancel };
};