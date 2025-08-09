import { useCallback } from "react";

export const useSpeechSynthesis = ({ onEnd }: { onEnd: () => void }) => {
    const speak = useCallback(({ text, voice: voiceLang }: { text: string; voice: string }) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Configurar el idioma
            utterance.lang = voiceLang;
            
            // Buscar una voz apropiada para el idioma
            const voices = window.speechSynthesis.getVoices();
            const spanishVoice = voices.find(voice => 
                voice.lang.startsWith(voiceLang.split('-')[0]) || 
                voice.lang.includes('es')
            );
            
            if (spanishVoice) {
                utterance.voice = spanishVoice;
            }
            
            utterance.rate = 0.9;
            utterance.pitch = 1;
            utterance.volume = 1;
            
            // Eventos
            utterance.onend = () => {
                console.log('Speech synthesis finished');
                onEnd();
            };
            
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
                onEnd();
            };
            
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn('Speech synthesis not supported');
            setTimeout(onEnd, 2000);
        }
    }, [onEnd]);

    const cancel = useCallback(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            console.log('Speech synthesis cancelled');
        }
    }, []);

    return { speak, cancel };
};