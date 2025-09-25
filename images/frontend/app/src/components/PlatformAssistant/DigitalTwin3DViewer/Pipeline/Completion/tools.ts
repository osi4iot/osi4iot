import { FindVariableClass, resolveMethodChain } from "./Completion";

export const applyFunction = (insert: string, iniChar: number, endChar: number) => {
    return (
        view: {
            dispatch: (arg0: {
                changes: { from: any; to: any; insert: string };
                selection: { anchor: any; head: any };
            }) => void;
        },
        completion: any,
        from: number,
        to: any
    ) => {
        view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + iniChar, head: from + endChar },
        });
    };
};

export interface ClassDef {
    name: string;
    methods: Method[];
    instances: any[];
}

export interface Method {
    label: string;
    type: string;
    info: string;
    detail: string;
    apply: string | ((view: any, completion: any, from: number, to: any) => void);
    source: string;
    returnType?: string;
    instanceName?: string;
}

export interface VariableInfo {
    sig: string;
    doc: string;
    constants: string[];
    methods: string[];
}

const isAssignment = (line: string, variableName: string): boolean => {
    const assignmentRegex = new RegExp(`(?:const|let|var)?\\s*${variableName}\\s*=\\s*([^;]+);?`);
    return assignmentRegex.test(line.trim());
};

const parseChainedMethodCall = (text: string): RegExpExecArray | null => {
    const baseMatch = /(\w+)((?:\.\w+\([^)]*(?:\([^)]*\)[^)]*)*\))+)(?:\.(\w*))?;?$/.exec(text);

    return baseMatch;
};

const parsePackageConstant = (text: string): RegExpExecArray | null => {
    const pattern = /(\w+)((?:\.\w+\([^)]*(?:\([^)]*\)[^)]*)*\))*?)\.(\w+);?$/;

    return pattern.exec(text);
};

const findMethodsAndConstants = (classDef: ClassDef) => {
    const methods: string[] = [];
    const constants: string[] = [];
    for (const method of classDef.methods) {
        if (method.type === "constant") {
            if (method.info === "") {
                constants.push(`${method.label}: ${method.detail}.`);
            } else {
                constants.push(`${method.label}: ${method.detail}. ${method.info}`);
            }
        } else {
            if (method.info === "") {
                methods.push(`${method.label}: ${method.detail}.`);
            } else {
                methods.push(`${method.label}: ${method.detail}. ${method.info}`);
            }
        }
    }
    return [methods, constants];
};

const findGoAllMethods = (classDef: ClassDef): string[] => {
    const methods: string[] = [];
    for (const method of classDef.methods) {
        if (method.instanceName) {
            methods.push(`${method.instanceName}: ${method.info}.`);
        }
    }
    return methods;
};

export const GetVariableInfo = (name: string, fullDoc: string, lineFullText: string): VariableInfo | null => {
    let info: VariableInfo | null = null;

    const packageConstantMatch = parsePackageConstant(lineFullText);
    if (packageConstantMatch) {
        const [, pkgName, , constantName] = packageConstantMatch;
        const [sourceClass] = FindVariableClass(pkgName, fullDoc);
        if (sourceClass) {
            const [, constants] = findMethodsAndConstants(sourceClass);
            const constant = constants.find((c) => c.startsWith(`${constantName}:`));
            if (constant && (constantName === name || isAssignment(lineFullText, name))) {
                info = {
                    sig: constant,
                    doc: `Constant ${constantName} in ${pkgName} package`,
                    constants: [],
                    methods: [],
                };
                return info;
            }
        }
    }

    const chainedMatch = parseChainedMethodCall(lineFullText);
    if (chainedMatch && !isAssignment(lineFullText, name)) {
        const [, variableName, methodChain] = chainedMatch;
        const [sourceClass] = FindVariableClass(variableName, fullDoc);
        if (sourceClass) {
            if (sourceClass.name.split(".")[0] === name || (sourceClass.name === "Go" && name === "go")) {
                const [methods, constants] = findMethodsAndConstants(sourceClass);
                const pkg = sourceClass.name.split(".")[0];
                info = {
                    sig: "",
                    doc: `Instance of ${pkg} package`,
                    constants,
                    methods,
                };
                return info;
            }

            if (sourceClass.name === "Go" && name === "All") {
                const methods = findGoAllMethods(sourceClass);
                info = {
                    sig: "",
                    doc: "Method for give access to different packages by destructuring",
                    constants: [],
                    methods,
                };
                return info;
            }

            const currentMethod = sourceClass.methods.find((m) => m.label === name);
            if (currentMethod) {
                const [pkg, type] = sourceClass.name.split(".");
                const methodSig = currentMethod.detail ? `${name}${currentMethod.detail}. ${currentMethod.info}` : "";
                info = {
                    sig: methodSig,
                    doc: `Method ${name} of type ${type} in ${pkg} package`,
                    constants: [],
                    methods: [],
                };
                return info;
            }

            const result = resolveMethodChain(sourceClass, methodChain);
            if (result) {
                const [finalClass, lastMethod] = result;
                if (finalClass) {
                    const [pkg, type] = finalClass.name.split(".");
                    const methodDetail = finalClass.methods.find((m) => m.label === lastMethod)?.detail || "";
                    const methodSig = methodDetail ? `${lastMethod}${methodDetail}` : "";
                    info = {
                        sig: methodSig,
                        doc: `Method ${lastMethod} of type ${type} in ${pkg} package`,
                        constants: [],
                        methods: [],
                    };
                    return info;
                }
            }
        }
    }
    const [classDef, origin] = FindVariableClass(name, fullDoc);
    if (!classDef) return null;

    const [methods, constants] = findMethodsAndConstants(classDef);

    const [pkg, type] = classDef.name.split(".");
    switch (origin) {
        case "destructuring":
        case "instance":
            info = {
                sig: "",
                doc: `Instance of ${pkg} package`,
                constants,
                methods,
            };
            break;
        case "instance_returned_by_method":
            info = {
                sig: "",
                doc: `Instance of type ${type} in ${pkg} package`,
                constants,
                methods,
            };
            break;
        default:
            if (origin && origin.startsWith("method: ")) {
                const methodName = origin.replace("method: ", "");
                const methodSig = methods.find((m) => m.startsWith(`${methodName}:`)) || "";
                info = {
                    sig: methodSig,
                    doc: `Method ${methodName} of type ${type} in ${pkg} package`,
                    constants: [],
                    methods: [],
                };
                break;
            }
    }

    return info;
};
