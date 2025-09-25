import { ClassDef } from "../tools";

export const timeLocationClass: ClassDef = {
    name: "time.Location",
    methods: [
        {
            label: "String",
            type: "method",
            info: "Returns a descriptive name for the time zone information, corresponding to the name argument to LoadLocation or FixedZone.",
            detail: "() => string",
            apply: "String()",
            returnType: "string",
            source: "go_method",
        },
    ],
    instances: [],
};
