import { applyFunction, ClassDef } from "../tools";

export const imageYCbCrSubsampleRatioClass: ClassDef = {
    name: "image.YCbCrSubsampleRatio",
    methods: [
        {
            label: "String",
            type: "method",
            info: "Returns a text-readable representation of the YCbCrSubsampleRatio value.",
            detail: "() => string",
            apply: applyFunction("String()", 5, 6),
            returnType: "string",
            source: "go_method",
        },           
    ],
    instances: [],
};