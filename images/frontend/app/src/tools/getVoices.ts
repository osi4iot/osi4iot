export type IChatVoice = {
    speechLang: SpeechSynthesisVoice | undefined;
    recognitionLang: string;
    greeting: string;
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
                greeting: "Hello! My name is OSI. How can I help you?",
            };
            break;
        case "en-UK-male":
            chatLanguage = {
                speechLang: findVoice(voices, "Google UK English Male"),
                recognitionLang: "en-GB",
                greeting: "Hello! My name is OSI. How can I help you?",
            };
            break;
        case "en-UK-female":
            chatLanguage = {
                speechLang: findVoice(voices, "Google UK English Female"),
                recognitionLang: "en-GB",
                greeting: "Hello! My name is OSI. How can I help you?",
            };
            break;
        case "es-ES":
            chatLanguage = {
                speechLang: findVoice(voices, "Google español"),
                recognitionLang: "es-ES",
                greeting: "¡Hola! Mi nombre es OSI. ¿En qué puedo ayudarte?",
            };
            break;
        case "fr-FR":
            chatLanguage = {
                speechLang: findVoice(voices, "Google français"),
                recognitionLang: "fr-FR",
                greeting: "Bonjour! Je m'appelle OSI. Comment puis-je vous aider?",
            };
            break;
        case "it-IT":
            chatLanguage = {
                speechLang: findVoice(voices, "Google italiano"),
                recognitionLang: "it-IT",
                greeting: "Ciao! Mi chiamo OSI. Come posso aiutarti?",
            };
            break;
        case "de-DE":
            chatLanguage = {
                speechLang: findVoice(voices, "Google Deutsch"),
                recognitionLang: "de-DE",
                greeting: "Hallo! Mein Name ist OSI. Wie kann ich Ihnen helfen?",
            };
            break;

        case "ca":
            chatLanguage = {
                speechLang: undefined,
                recognitionLang: "ca",
                greeting: "Hola! Em dic OSI. Com puc ajudar-te?",
            };
            break;
        default:
            chatLanguage = {
                speechLang: undefined,
                recognitionLang: "none",
                greeting: "Hello! My name is OSI. How can I help you?",
            };
    }

    return chatLanguage;
};

export default getVoices;
