import { applyFunction, ClassDef } from "./tools";

export const httpClass: ClassDef = {
    name: "http.Http",
    methods: [
        {
            label: "Get",
            type: "method",
            info: "Make GET request",
            detail: "Get(url: string) => any",
            apply: applyFunction('Get("https://api.example.com")', 5, 29),
            returnType: "any",
            source: "osi4iot",
        },
    ],
    instances: [
        {
            label: "http",
            declaration: "const http = go.Http()",
            insert: "http = go.Http();",
            info: "Create HTTP instance",
        },
    ],
};
