export type IChatVoice = {
    speechLang: SpeechSynthesisVoice | undefined;
    recognitionLang: string;
};

const getVoices = (chatAssistantLanguage: string): Promise<IChatVoice> => {
    return new Promise((resolve) => {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            const voice = selectVoice(voices, chatAssistantLanguage);
            resolve(voice);
            return;
        }

        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            const voice = selectVoice(voices, chatAssistantLanguage);
            resolve(voice);
        };
    });
};

const findVoice = (voices: SpeechSynthesisVoice[], name: string) => {
    return voices.find((voice) => voice.name === name) || voices[0];
};

const selectVoice = (voices: SpeechSynthesisVoice[], chatAssistantLanguage: string): IChatVoice=> {
    let chatLanguage: IChatVoice;
    switch (chatAssistantLanguage) {
        case "none":
            chatLanguage = {
                speechLang: undefined,
                recognitionLang: "none",
            };
            break;
        case "en-UK-male":
            chatLanguage = {
                speechLang: findVoice(voices, "Google UK English Male"),
                recognitionLang: "en-GB",
            };
            break;
        case "en-UK-female":
            chatLanguage = {
                speechLang: findVoice(voices, "Google UK English Female"),
                recognitionLang: "en-GB",
            };
            break;
        case "es-ES":
            chatLanguage = {
                speechLang: findVoice(voices, "Google español"),
                recognitionLang: "es-ES",
            };
            break;
        case "fr-FR":
            chatLanguage = {
                speechLang: findVoice(voices, "Google français"),
                recognitionLang: "fr-FR",
            };
            break;
        case "it-IT":
            chatLanguage = {
                speechLang: findVoice(voices, "Google italiano"),
                recognitionLang: "it-IT",
            };
            break;
        case "de-DE":
            chatLanguage = {
                speechLang: findVoice(voices, "Google Deutsch"),
                recognitionLang: "de-DE",
            };
            break;

        case "ca":
            chatLanguage = {
                speechLang: undefined,
                recognitionLang: "ca",
            };
            break;
        default:
            chatLanguage = {
                speechLang: undefined,
                recognitionLang: "none",
            };
    }

    return chatLanguage;
};

export default getVoices;
