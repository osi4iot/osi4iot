import { ClassDef } from "../tools";

export const timeMonthClass: ClassDef = {
    name: "time.Month",
    methods: [
        {
            label: "String",
            type: "method",
            info: "Returns the English name of the month ('January', 'February', ...).",
            detail: "() => string",
            apply: "String()",
            returnType: "string",
            source: "go_method",
        },
    ],
    instances: [],
};
