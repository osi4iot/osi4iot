import { applyFunction, ClassDef } from "../tools";

export const colorPaletteClass: ClassDef = {
    name: "color.Palette",
    methods: [
        {
            label: "Convert",
            type: "method",
            info: "Returns the palette color closest to c in Euclidean R,G,B space.",
            detail: "(c color.Color) => color.Color",
            apply: applyFunction('Convert(c)', 8, 9),
            returnType: "color.Color",
            source: "go_method",
        },
        {
            label: "Index",
            type: "method",
            info: "Returns the index of the palette color closest to c in Euclidean R,G,B,A space.",
            detail: "(c color.Color) => int",
            apply: applyFunction('Index(c)', 6, 7),
            returnType: "int",
            source: "go_method",
        },                                                                         
    ],
    instances: [],
};