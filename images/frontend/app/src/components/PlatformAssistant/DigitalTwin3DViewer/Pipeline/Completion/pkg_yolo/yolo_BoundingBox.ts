import { applyFunction, ClassDef } from "../tools";

export const yoloBoundingBoxClass: ClassDef = {
    name: "yolo.BoundingBox",
    methods: [
        {
            label: "Intersection",
            type: "method",
            info: "Returns the intersection area of two bounding boxes.",
            detail: "(box yolo.BoundingBox) => float32",
            apply: applyFunction("Intersection(box)", 13, 16),
            returnType: "float32",
            source: "osi4iot",
        },
        {
            label: "Iou",
            type: "method",
            info: "Returns the IoU (Intersection over Union) of two bounding boxes.",
            detail: "(box yolo.BoundingBox) => float32",
            apply: applyFunction("Iou(box)", 7, 17),
            returnType: "float32",
            source: "osi4iot",
        },
        {
            label: "RectArea",
            type: "method",
            info: "Returns the area of the rectangle.",
            detail: "(box yolo.BoundingBox) => int",
            apply: applyFunction("RectArea(box)", 9, 12),
            returnType: "int",
            source: "osi4iot",
        },
        {
            label: "ToRect",
            type: "method",
            info: "Converts the bounding box to a rectangle.",
            detail: "(box yolo.BoundingBox) => image.Rectangle",
            apply: applyFunction("ToRect(box)", 7, 10),
            returnType: "image.Rectangle",
            source: "osi4iot",
        },
        {
            label: "Union",
            type: "method",
            info: "Returns the union area of two bounding boxes.",
            detail: "(box yolo.BoundingBox) => float32",
            apply: applyFunction("Union(box)", 6, 9),
            returnType: "float32",
            source: "osi4iot",
        },
    ],
    instances: [
        {
            label: "Yolo",
            type: "class",
            info: "Instance to give access to yolo package",
            detail: "Create an instance to give access to yolo package",
            apply: "Yolo();",
            returnType: "yolo.Yolo",
            instanceName: "yolo",
            source: "osi4iot",
        }
    ],
};
