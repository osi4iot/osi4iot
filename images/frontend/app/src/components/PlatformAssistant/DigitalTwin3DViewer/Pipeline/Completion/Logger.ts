import { applyFunction, ClassDef } from "./utils";

export const loggerClass: ClassDef = {
    name: "Logger",
    methods: [
        {
            label: "Msg",
            type: "method",
            info: "Logs a simple message",
            detail: "(message: Message) => void",
            apply: "Msg(msg);",
            returnType: undefined,
            source: "osi4iot",
        },
        {
            label: "Infof",
            type: "method",
            info: "Logs a formatted info message",
            detail: "(format: string, ...args) => void",
            apply: applyFunction('Infof("format", arg);', 7, 13),
            returnType: undefined,
            source: "osi4iot",
        },
        {
            label: "Errorf",
            type: "method",
            info: "Logs a formatted error message",
            detail: "(format: string, ...args) => void",
            apply: applyFunction('Errorf("format", arg);', 8, 14),
            returnType: undefined,
            source: "osi4iot",
        },
    ],
    instances: [
        {
            label: "log",
            declaration: "const log = go.Logger()",
            insert: "log = go.Logger();",
            info: "Create Logger instance",
        },
    ],
};
