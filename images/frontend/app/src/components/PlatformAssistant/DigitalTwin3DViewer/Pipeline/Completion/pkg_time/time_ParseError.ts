import { ClassDef } from "../tools";

export const timeParseErrorClass: ClassDef = {
    name: "time.ParseError",
    methods: [
        {
            label: "Error()",
            type: "method",
            info: "Returns the string representation of a ParseError.",
            detail: "() => string",
            apply: "Error()",
            returnType: "string",
            source: "go_method",
        },
    ],
    instances: [],
};
