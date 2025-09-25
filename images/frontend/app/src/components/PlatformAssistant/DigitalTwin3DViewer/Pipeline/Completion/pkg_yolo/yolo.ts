import { applyFunction, ClassDef } from "../tools";

export const yoloClass: ClassDef = {
    name: "yolo.Yolo",
    methods: [
        {
            label: "DrawBoundingBoxes",
            type: "method",
            info: "Draws bounding boxes on the image.",
            detail: "(pic image.Image, boxes []BoundingBox, fontSize float64, fillOpacity int) => image.Image",
            apply: applyFunction("DrawBoundingBoxes(pic, boxes, fontSize, fillOpacity)", 13, 18),
            returnType: "image.Image",
            source: "osi4iot",
        },
        {
            label: "GetYoloClass",
            type: "method",
            info: "Returns the Yolo class name.",
            detail: "(index int) => string",
            apply: applyFunction("GetYoloClass(index)", 13, 18),
            returnType: "string",
            source: "osi4iot",
        },
        {
            label: "GetYoloColor",
            type: "method",
            info: "Returns the Yolo color.",
            detail: "(index int) => color.RGBA",
            apply: applyFunction("GetYoloColor(index)", 13, 18),
            returnType: "color.RGBA",
            source: "osi4iot",
        },
        {
            label: "NewBoundingBox",
            type: "method",
            info: "Creates a new bounding box.",
            detail: "(x1, y1, x2, y2 float32, confidence float32) => yolo.BoundingBox",
            apply: applyFunction("NewBoundingBox(x1, y1, x2, y2, confidence)", 15, 17),
            returnType: "yolo.BoundingBox",
            source: "osi4iot",
        },
        {
            label: "Postprocess",
            type: "method",
            info: "Postprocesses the output of the YOLO model.",
            detail: "(output: float32[], originalWidth: int, originalHeight: int) => yolo.BoundingBox[]",
            apply: applyFunction("Postprocess(output, originalWidth, originalHeight)", 12, 18),
            returnType: "yolo.BoundingBox[]",
            source: "osi4iot",
        },
        {
            label: "Preprocess",
            type: "method",
            info: "Preprocesses the image for YOLO model input.",
            detail: "(pic: image.Image) => float32[]",
            apply: applyFunction("Preprocess(pic)", 11, 14),
            returnType: "float32[]",
            source: "osi4iot",
        },
    ],
    instances: [
        {
            label: "yolo",
            declaration: "const yolo = go.Yolo()",
            insert: "yolo = go.Yolo();",
            info: "Create Yolo instance",
        },
    ],
};
