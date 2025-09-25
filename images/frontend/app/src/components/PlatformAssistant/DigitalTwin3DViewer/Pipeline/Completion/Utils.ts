import { applyFunction, ClassDef } from "./tools";

export const utilsClass: ClassDef = {
    name: "Utils",
    methods: [
        {
            label: "GetTopicByRef",
            type: "method",
            info: "Get topic by reference",
            detail: "(topicRef: string) => string",
            apply: applyFunction('GetTopicByRef("dev2pdb")', 15, 22),
            returnType: "string",
            source: "osi4iot",
        },
        {
            label: "GetTopicTypeFromMessage",
            type: "method",
            info: "Get topic type from message",
            detail: "(msg: Message) => string",
            apply: "GetTopicTypeFromMessage(msg);",
            returnType: "string",
            source: "osi4iot",
        },
        {
            label: "Nil",
            type: "method",
            info: "Return nil",
            detail: "() => any",
            apply: "Nil()",
            returnType: "any",
            source: "osi4iot",
        },       
    ],
    instances: [
        {
            label: "utils",
            declaration: "const utils = go.Utils()",
            insert: "utils = go.Utils();",
            info: "Create Utils instance",
        },
    ],
};
