import { CompletionContext } from "@codemirror/autocomplete";
import { kvStoreClass } from "./kvStore";
import { loggerClass } from "./Logger";
import { httpClass } from "./http";
import { timeClass } from "./time";
import { durationClass } from "./Duration";
import { locationClass } from "./location";
import { applyFunction, ClassDef } from "./utils";

const classDefinitions: { [key: string]: ClassDef } = {
    Go: {
        name: "Go",
        methods: [
            {
                label: "KvStore",
                type: "class",
                info: "",
                detail: "Create a new KvStore instance",
                apply: "KvStore();",
                returnType: undefined,
                instanceName: "kvStore",
                source: "osi4iot",
            },
            {
                label: "Logger",
                type: "class",
                info: "",
                detail: "Create a new Logger instance",
                apply: "Logger();",
                returnType: undefined,
                instanceName: "log",
                source: "osi4iot",
            },
            {
                label: "Http",
                type: "class",
                info: "",
                detail: "Create a new Http instance",
                apply: "Http();",
                returnType: undefined,
                instanceName: "http",
                source: "osi4iot",
            },
            {
                label: "Time",
                type: "class",
                info: "",
                detail: "Create a new Time instance",
                apply: "Time();",
                returnType: undefined,
                instanceName: "time",
                source: "osi4iot",
            },
        ],
        instances: [
            {
                label: "go",
                declaration: "const go = Go()",
                insert: "go = Go();",
                info: "Create Go instance",
            },
        ],
    },
    Logger: loggerClass,
    KvStore: kvStoreClass,
    Http: httpClass,
    Time: timeClass,
    Duration: durationClass,
    Location: locationClass,
};

// Cache para evitar recursión infinita
const variableCache = new Map<string, [ClassDef | null, string]>();

// Función principal para encontrar la clase de una variable
function findVariableClass(
    variableName: string,
    fullDoc: string,
    visitedVars = new Set<string>()
): [ClassDef | null, string] {
    // Evitar recursión infinita
    if (visitedVars.has(variableName)) {
        return [null, ""];
    }

    // Verificar cache
    const cacheKey = `${variableName}:${fullDoc.length}`;
    if (variableCache.has(cacheKey)) {
        return variableCache.get(cacheKey)!;
    }

    visitedVars.add(variableName);

    // CASO 1: Destructuring con go.All() - ej: const { log, time } = go.All();
    const destructuringResult = checkDestructuringPattern(variableName, fullDoc);
    if (destructuringResult) {
        variableCache.set(cacheKey, destructuringResult);
        return destructuringResult;
    }

    // CASO 2: Declaraciones directas - ej: const log = go.Logger();
    const directResult = checkDirectDeclarations(variableName, fullDoc);
    if (directResult) {
        variableCache.set(cacheKey, directResult);
        return directResult;
    }

    // CASO 3: Métodos simples - ej: const result = time.Now();
    const methodResult = checkMethodCalls(variableName, fullDoc, visitedVars);
    if (methodResult) {
        variableCache.set(cacheKey, methodResult);
        return methodResult;
    }

    // CASO 4: Métodos encadenados - ej: const t1 = time.Now().ISOWeek();
    const chainedResult = checkChainedMethods(variableName, fullDoc, visitedVars);
    if (chainedResult) {
        variableCache.set(cacheKey, chainedResult);
        return chainedResult;
    }

    const result: [ClassDef | null, string] = [null, ""];
    variableCache.set(cacheKey, result);
    return result;
}

// CASO 1: Detectar destructuring assignment
function checkDestructuringPattern(variableName: string, fullDoc: string): [ClassDef | null, string] | null {
    // Buscar patrón: const { log, time } = go.All();
    const destructuringRegex = new RegExp(
        `(?:const|let|var)\\s*\\{[^}]*\\b${variableName}\\b[^}]*\\}\\s*=\\s*\\w+\\.All\\s*\\([^)]*\\)`,
        "g"
    );

    if (destructuringRegex.test(fullDoc)) {
        // Buscar en todas las clases cuál tiene una instancia con este nombre
        for (const [, classDef] of Object.entries(classDefinitions)) {
            if (classDef.instances) {
                const matchingInstance = classDef.instances.find((instance) => instance.label === variableName);
                if (matchingInstance) {
                    return [classDef, "destructuring"];
                }
            }
        }
    }

    return null;
}

// CASO 2: Declaraciones directas de instancias
function checkDirectDeclarations(variableName: string, fullDoc: string): [ClassDef | null, string] | null {
    for (const [className, classDef] of Object.entries(classDefinitions)) {
        const patterns = [
            // const log = Logger();
            new RegExp(`(?:const|let|var)\\s+${variableName}\\s*=\\s*(?:new\\s+)?${className}\\s*\\([^)]*\\)`, "g"),
            // const log = go.Logger();
            new RegExp(`(?:const|let|var)\\s+${variableName}\\s*=\\s*\\w+\\.${className}\\s*\\([^)]*\\)`, "g"),
            // log := Logger(); (Go style)
            new RegExp(`${variableName}\\s*:=\\s*${className}\\s*\\([^)]*\\)`, "g"),
        ];

        const foundClass = patterns.some((pattern) => pattern.test(fullDoc));
        if (foundClass) {
            return [classDef, "instance"];
        }
    }

    return null;
}

// CASO 3: Métodos que retornan tipos específicos
function checkMethodCalls(
    variableName: string,
    fullDoc: string,
    visitedVars: Set<string>
): [ClassDef | null, string] | null {
    // Buscar patrón: const result = someVar.someMethod();
    const methodCallRegex = new RegExp(
        `(?:const|let|var)\\s+${variableName}\\s*=\\s*(\\w+)\\.(\\w+)\\s*\\([^)]*\\)`,
        "g"
    );

    let match;
    while ((match = methodCallRegex.exec(fullDoc)) !== null) {
        const [, sourceVarName, methodName] = match;

        // Evitar recursión infinita al buscar la clase de la variable fuente
        if (visitedVars.has(sourceVarName)) {
            continue;
        }

        // Buscar directamente la clase de la variable fuente por su nombre
        const sourceClassDef = findSourceVariableClass(sourceVarName, fullDoc);

        if (sourceClassDef && sourceClassDef.methods) {
            // Buscar el método y su returnType
            const method = sourceClassDef.methods.find((m) => m.label === methodName);
            if (method && method.returnType) {
                const returnClassDef = classDefinitions[method.returnType];
                if (returnClassDef) {
                    return [returnClassDef, "method_return"];
                }
            }
        }
    }

    return null;
}

// Función auxiliar para encontrar la clase de una variable fuente sin recursión
function findSourceVariableClass(variableName: string, fullDoc: string): ClassDef | null {
    // Buscar si es una instancia conocida por destructuring
    const destructuringRegex = new RegExp(
        `(?:const|let|var)\\s*\\{[^}]*\\b${variableName}\\b[^}]*\\}\\s*=\\s*\\w+\\.All\\s*\\([^)]*\\)`,
        "g"
    );

    if (destructuringRegex.test(fullDoc)) {
        for (const [, classDef] of Object.entries(classDefinitions)) {
            if (classDef.instances) {
                const matchingInstance = classDef.instances.find((instance) => instance.label === variableName);
                if (matchingInstance) {
                    return classDef;
                }
            }
        }
    }

    // Buscar declaraciones directas
    for (const [className, classDef] of Object.entries(classDefinitions)) {
        const patterns = [
            new RegExp(`(?:const|let|var)\\s+${variableName}\\s*=\\s*(?:new\\s+)?${className}\\s*\\([^)]*\\)`, "g"),
            new RegExp(`(?:const|let|var)\\s+${variableName}\\s*=\\s*\\w+\\.${className}\\s*\\([^)]*\\)`, "g"),
            new RegExp(`${variableName}\\s*:=\\s*${className}\\s*\\([^)]*\\)`, "g"),
        ];

        const foundClass = patterns.some((pattern) => pattern.test(fullDoc));
        if (foundClass) {
            return classDef;
        }
    }

    return null;
}

// CASO 4: Métodos encadenados
function checkChainedMethods(
    variableName: string,
    fullDoc: string,
    visitedVars: Set<string>
): [ClassDef | null, string] | null {
    // Buscar patrón: const t1 = time.Now().ISOWeek();
    const chainedRegex = new RegExp(
        `(?:const|let|var)\\s+${variableName}\\s*=\\s*(\\w+)\\.((?:\\w+\\s*\\([^)]*\\)\\.?)+)`,
        "g"
    );

    let match;
    while ((match = chainedRegex.exec(fullDoc)) !== null) {
        const [, sourceVarName, methodChain] = match;

        // Evitar recursión infinita
        if (visitedVars.has(sourceVarName)) {
            continue;
        }

        // Encontrar la clase de la variable fuente sin recursión
        const sourceClass = findSourceVariableClass(sourceVarName, fullDoc);

        if (sourceClass) {
            // Resolver la cadena de métodos
            const result = resolveMethodChain(sourceClass, methodChain);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

// Función auxiliar para resolver cadenas de métodos
function resolveMethodChain(startClass: ClassDef, methodChain: string): [ClassDef | null, string] | null {
    // Extraer métodos de la cadena: ".Now().ISOWeek()" -> ["Now", "ISOWeek"]
    const methodMatches = methodChain.match(/\.(\w+)\([^)]*\)/g);
    if (!methodMatches) return null;

    const methodNames = methodMatches
        .map((match) => {
            const nameMatch = match.match(/\.(\w+)\(/);
            return nameMatch ? nameMatch[1] : null;
        })
        .filter((name) => name !== null) as string[];


    if (methodNames.length === 0) return null;

    let currentClass = startClass;
    let lastMethodName = "instance";

    // Seguir la cadena de métodos paso a paso
    for (let i = 0; i < methodNames.length; i++) {
        const methodName = methodNames[i];
        const isLastMethod = i === methodNames.length - 1;

        if (!currentClass || !currentClass.methods) return null;

        // Buscar el método en la clase actual
        const method = currentClass.methods.find((m) => m.label === methodName);
        if (!method) return null;

        lastMethodName = methodName;

        // Si el método tiene returnType, continuar con esa clase
        if (method.returnType && classDefinitions[method.returnType]) {
            currentClass = classDefinitions[method.returnType];
        } else {
            // Si el método no tiene returnType (devuelve un tipo primitivo como float64, string, etc.)
            // y no es el último método de la cadena, entonces la cadena es inválida
            if (!isLastMethod) {
                return null;
            }
            // Si es el último método y no tiene returnType, significa que devuelve un tipo primitivo
            // No debería mostrar autocompletado
            return [null, lastMethodName];
        }
    }

    return [currentClass, lastMethodName];
}

// Función principal de autocompletado
function GeneralizedCompletion(context: CompletionContext) {
    // Limpiar cache periódicamente para evitar acumulación excesiva
    if (variableCache.size > 1000) {
        variableCache.clear();
    }

    let before = context.matchBefore(/[\w.()"]*/);
    if (!before) return null;

    let text = context.state.sliceDoc(before.from, before.to);

    // Obtener el contexto completo de la línea actual
    const lineStart = context.state.doc.lineAt(context.pos).from;
    const fullLineText = context.state.sliceDoc(lineStart, context.pos);

    // CASO A: Métodos encadenados (ej: time.Now().)
    const chainedResult = handleChainedCompletion(fullLineText, context);
    if (chainedResult) return chainedResult;

    // CASO B: Métodos simples (ej: log.)
    const simpleResult = handleSimpleCompletion(text, context, before);
    if (simpleResult) return simpleResult;

    // CASO C: Declaraciones de instancias (ej: escribir "log" para sugerir "log = go.Logger();")
    const instanceResult = handleInstanceCompletion(text, before);
    if (instanceResult) return instanceResult;

    return null;
}

function createGoAllMethods(methods: any[]) {
    const goAllMethods: any[] = [];
    methods.forEach((method) => {
        goAllMethods.push({
            label: method.instanceName,
            type: "method",
            info: "",
            detail: `Instance of ${method.label} class`,
            apply: applyFunction("", 0, 0),
            returnType: undefined,
            source: "osi4iot",
        });
    });
    return goAllMethods;
}

// Función auxiliar para parsear llamadas a métodos encadenados con paréntesis anidados
function parseChainedMethodCall(text: string): RegExpExecArray | null {
    // Buscar el patrón: variable.method().method().
    const baseMatch = /(\w+)((?:\.\w+\([^)]*(?:\([^)]*\)[^)]*)*\))+)\.(\w*)$/.exec(text);
    
    if (!baseMatch) {
        // Intentar con un enfoque más robusto usando conteo de paréntesis
        return parseChainedMethodCallRobust(text);
    }
    
    return baseMatch;
}

// Función más robusta para manejar paréntesis profundamente anidados
function parseChainedMethodCallRobust(text: string): RegExpExecArray | null {
    // Buscar desde el final hacia atrás: variable.methods().
    const endMatch = /\.(\w*)$/.exec(text);
    if (!endMatch) return null;
    
    const currentMethod = endMatch[1];
    const beforeCurrentMethod = text.slice(0, endMatch.index);
    
    // Para casos simples como "go.", "log.", "time." sin métodos
    const simpleMatch = /(\w+)$/.exec(beforeCurrentMethod);
    if (simpleMatch && !beforeCurrentMethod.includes('(')) {
        // Es un caso simple: variable.
        return null; // Esto será manejado por handleSimpleCompletion
    }
    
    // Buscar el inicio de la cadena de métodos
    let pos = beforeCurrentMethod.length - 1;
    let parenCount = 0;
    let methodChain = '';
    let foundStart = false;
    let variableName = '';
    let hasFoundMethod = false; // Flag para verificar que encontramos al menos un método
    
    // Recorrer hacia atrás hasta encontrar el inicio de la cadena
    while (pos >= 0) {
        const char = beforeCurrentMethod[pos];
        
        if (char === ')') {
            parenCount++;
            methodChain = char + methodChain;
            hasFoundMethod = true; // Encontramos al menos un paréntesis de cierre
        } else if (char === '(') {
            parenCount--;
            methodChain = char + methodChain;
            
            // Si parenCount se vuelve negativo, algo está mal
            if (parenCount < 0) {
                return null;
            }
        } else if (char === '.' && parenCount === 0) {
            // Encontramos un punto fuera de paréntesis
            if (methodChain === '') {
                // Este es el punto antes del método actual, continuamos
                pos--;
                continue;
            }
            
            // Verificar si hay más métodos o si llegamos al nombre de variable
            const beforeDot = beforeCurrentMethod.slice(0, pos);
            
            // Buscar si hay otro método antes de este punto
            let foundPreviousMethod = false;
            let tempPos = pos - 1;
            let tempParenCount = 0;
            
            // Buscar hacia atrás para ver si hay un método (termina en ')')
            while (tempPos >= 0) {
                const tempChar = beforeDot[tempPos];
                if (tempChar === ')') {
                    tempParenCount++;
                } else if (tempChar === '(') {
                    tempParenCount--;
                    if (tempParenCount === 0) {
                        // Encontramos el inicio de un método
                        foundPreviousMethod = true;
                        break;
                    }
                } else if (tempChar === '.' && tempParenCount === 0) {
                    // Llegamos a otro punto, no hay método anterior inmediato
                    break;
                } else if (!foundPreviousMethod && tempParenCount === 0 && !/[\w.]/.test(tempChar)) {
                    // Encontramos un carácter que no es válido en un identificador
                    break;
                }
                tempPos--;
            }
            
            if (foundPreviousMethod) {
                // Hay otro método antes, necesitamos incluirlo
                const methodStart = tempPos;
                while (tempPos >= 0 && /\w/.test(beforeDot[tempPos])) {
                    tempPos--;
                }
                const methodName = beforeDot.slice(tempPos + 1, methodStart + 1);
                methodChain = '.' + methodName + methodChain;
                pos = tempPos;
            } else {
                // Llegamos al nombre de variable
                const varMatch = /(\w+)$/.exec(beforeDot);
                if (varMatch) {
                    variableName = varMatch[1];
                    foundStart = true;
                    break;
                } else {
                    // No encontramos variable válida
                    return null;
                }
            }
        } else if (/\w/.test(char) && parenCount > 0) {
            // Estamos dentro de paréntesis, agregar el carácter
            methodChain = char + methodChain;
        } else if (/\w/.test(char) && methodChain !== '' && parenCount === 0) {
            // Estamos en el nombre de un método
            methodChain = char + methodChain;
        } else if (methodChain === '' && parenCount === 0) {
            // Aún no hemos encontrado métodos
            pos--;
            continue;
        } else if (parenCount === 0 && !/[\w.]/.test(char)) {
            // Encontramos un carácter que no es válido, salir
            break;
        } else {
            methodChain = char + methodChain;
        }
        
        pos--;
    }
    
    // Verificar que encontramos una estructura válida
    if (foundStart && variableName && methodChain && hasFoundMethod) {
        // Crear un array similar al resultado de RegExp.exec
        const fullMatch = variableName + methodChain + '.' + currentMethod;
        const result = [fullMatch, variableName, methodChain, currentMethod] as unknown as RegExpExecArray;
        result.index = text.length - fullMatch.length;
        result.input = text;
        return result;
    }
    
    return null;
}

// CASO A: Completar métodos en cadenas
function handleChainedCompletion(fullLineText: string, context: CompletionContext) {
    // Buscar patrón: variable.method1().method2().
    // Usar una función auxiliar para manejar paréntesis anidados correctamente
    const chainedMatch = parseChainedMethodCall(fullLineText);

    if (chainedMatch) {
        const [, variableName, methodChain, currentMethod] = chainedMatch;
        const fullDoc = context.state.doc.toString();

        // Encontrar la clase de la variable inicial
        const [sourceClass] = findVariableClass(variableName, fullDoc);
        if (sourceClass) {
            if (variableName === "go" && methodChain === ".All()") {
                const goMethods = createGoAllMethods(sourceClass.methods);
                return {
                    from: context.pos - currentMethod.length,
                    options: goMethods,
                    validFor: /^\w*$/,
                };
            } else {
                // Resolver la cadena hasta el punto actual
                const result = resolveMethodChain(sourceClass, methodChain);

                if (result) {
                    const [finalClass, lastMethod] = result;

                    // Si finalClass es null, significa que el último método devuelve un tipo primitivo
                    // No se debe mostrar autocompletado
                    if (!finalClass) {
                        return null;
                    }

                    if (finalClass.methods) {
                        // Filtrar métodos disponibles - mostrar métodos go_method para retornos de métodos
                        const filteredMethods = finalClass.methods.filter(
                            (method) =>
                                lastMethod === "instance" ||
                                method.source === "go_method" ||
                                (lastMethod !== "instance" &&
                                    lastMethod !== method.label &&
                                    method.source === "go_method")
                        );

                        return {
                            from: context.pos - currentMethod.length,
                            options: filteredMethods,
                            validFor: /^\w*$/,
                        };
                    }
                }
            }
        }
    }

    return null;
}

// CASO B: Completar métodos simples
function handleSimpleCompletion(text: string, context: CompletionContext, before: any) {
    const variableMatch = /(\w+)\.(\w*)$/.exec(text);

    if (variableMatch) {
        const [, variableName] = variableMatch;
        const fullDoc = context.state.doc.toString();

        // Encontrar la clase de esta variable
        const [classDef, origin] = findVariableClass(variableName, fullDoc);

        if (classDef && classDef.methods) {
            let filteredMethods;

            if (origin === "method_return") {
                // Para variables que son resultado de métodos, mostrar métodos go_method
                filteredMethods = classDef.methods.filter((method) => method.source === "go_method");
            } else {
                // Lógica original para otros casos
                filteredMethods = classDef.methods.filter(
                    (method) =>
                        origin === "instance" ||
                        (origin === "destructuring" &&
                            (method.source === "go_constant" ||
                                method.source === "go_function" ||
                                method.source === "osi4iot"))
                );
            }

            const methodsWithBoost = filteredMethods.map((method) => ({
                ...method,
                boost: method.source === "go_function" || method.source === "go_method" ? 100 : 10,
            }));

            return {
                from: before.from + variableMatch.index + variableName.length + 1,
                options: methodsWithBoost,
                validFor: /^\w*$/,
            };
        }
    }

    return null;
}

// CASO C: Sugerir declaraciones de instancias
function handleInstanceCompletion(text: string, before: any) {
    const word = /\w*$/.exec(text);

    if (word && word[0] && !text.includes(".")) {
        const allInstances: any[] = [];

        // Recopilar todas las instancias que coincidan
        for (const [, classDef] of Object.entries(classDefinitions)) {
            if (classDef.instances) {
                classDef.instances.forEach((instance) => {
                    if (instance.label.toLowerCase().startsWith(word[0].toLowerCase())) {
                        allInstances.push({
                            label: instance.label,
                            type: "variable",
                            info: instance.info,
                            detail: instance.declaration,
                            apply: (view: any, completion: any, from: any, to: any) => {
                                view.dispatch({
                                    changes: { from, to, insert: instance.insert },
                                    selection: {
                                        anchor: from + instance.insert.length,
                                        head: from + instance.insert.length,
                                    },
                                });
                            },
                        });
                    }
                });
            }
        }

        if (allInstances.length > 0) {
            return {
                from: before.from + word.index,
                options: allInstances,
                validFor: /^\w*$/,
            };
        }
    }

    return null;
}

export default GeneralizedCompletion;
