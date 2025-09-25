import { ClassDef } from "../tools";

export const colorNYCbCrAClass: ClassDef = {
    name: "color.NYCbCrA",
    methods: [
        {
            label: "RGBA",
            type: "method",
            info: "Returns the alpha-premultiplied red, green, blue and alpha values for the color.",
            detail: "() => (r, g, b, a uint32)",
            apply: "RGBA()",
            returnType: "[uint32, uint32, uint32, uint32]",
            source: "go_method",
        },                                                                           
    ],
    instances: [],
};