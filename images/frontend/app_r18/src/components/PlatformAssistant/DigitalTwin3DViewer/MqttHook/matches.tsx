const SEPARATOR = "/";
const SINGLE = "+";
const ALL = "#";

export default function matches(pattern: string, topic: string) {
    var patternSegments = pattern.split(SEPARATOR);
    var topicSegments = topic.split(SEPARATOR);

    var patternLength = patternSegments.length;
    var topicLength = topicSegments.length;
    var lastIndex = patternLength - 1;

    for (var i = 0; i < patternLength; i++) {
        var currentPattern = patternSegments[i];
        var patternChar = currentPattern[0];
        var currentTopic = topicSegments[i];

        if (!currentTopic && !currentPattern)
            continue;

        if (!currentTopic && currentPattern !== ALL) return false;

        // Only allow # at end
        if (patternChar === ALL)
            return i === lastIndex;
        if (patternChar !== SINGLE && currentPattern !== currentTopic)
            return false;
    }

    return patternLength === topicLength;
}