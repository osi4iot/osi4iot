import { ClassDef } from "../tools";

export const timeWeekdayClass: ClassDef = {
    name: "time.Weekday",
    methods: [
        {
            label: "String",
            type: "method",
            info: "Returns the English name of the day ('Sunday', 'Monday', ...).",
            detail: "() => string",
            apply: "String()",
            returnType: "string",
            source: "go_method",
        },
    ],
    instances: [],
};
