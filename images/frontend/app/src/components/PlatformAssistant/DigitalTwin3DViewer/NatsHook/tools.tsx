const SEPARATOR = ".";
const SINGLE = "*";
const ALL = ">";
 
export const matches = (pattern: string, subject: string) => {
    const patternSegments = pattern.split(SEPARATOR);
    const subjectSegments = subject.split(SEPARATOR);
 
    const patternLength = patternSegments.length;
    const subjectLength = subjectSegments.length;
    const lastIndex = patternLength - 1;
 
    for (let i = 0; i < patternLength; i++) {
        const currentPattern = patternSegments[i];
        const patternChar = currentPattern[0];
        const currentSubject = subjectSegments[i];
 
        if (!currentSubject && !currentPattern)
            continue;
 
        if (!currentSubject && currentPattern !== ALL) return false;
 
        // ">" only allowed at end and matches everything remaining
        if (patternChar === ALL)
            return i === lastIndex;
 
        if (patternChar !== SINGLE && currentPattern !== currentSubject)
            return false;
    }
 
    return patternLength === subjectLength;
}

export const mqttTopicToNatsSubject = (mqttTopic: string): string => {
    return mqttTopic.replaceAll("/", ".");
};

const NOT_ALLOWED_PREFIXES = ["dev2dtm", "dtm2pdb", "dtm2dev", "sim2llm", "sim2state", "inject"];

export const filterNatsSubject = (subject: string) => {
    if(subject !== "" && !NOT_ALLOWED_PREFIXES.some(prefix => subject.startsWith(prefix))) {
        return subject;
    }
}