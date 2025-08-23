// import { containsLatex } from "./MathMessage";

interface TTSNormalizerOptions {
    language: string;
    domain?: "physics" | "chemistry" | "engineering" | "general";
    preserveFormulas?: boolean;
}

class TTSNormalizer {
    private units: Record<string, Record<string, string>>;
    private symbols: Record<string, Record<string, string>>;

    constructor() {
        this.units = {
            es: {
                // Unidades físicas básicas
                Pa: "pascales",
                kPa: "kilopascales",
                MPa: "megapascales",
                GPa: "gigapascales",
                N: "newtons",
                kN: "kilonewtons",
                MN: "meganewtons",
                J: "julios",
                kJ: "kilojulios",
                MJ: "megajulios",
                GJ: "gigajulios",
                W: "vatios",
                kW: "kilovatios",
                MW: "megavatios",
                GW: "gigavatios",
                Hz: "hercios",
                kHz: "kilohercios",
                MHz: "megahercios",
                GHz: "gigahercios",
                V: "voltios",
                mV: "milivoltios",
                kV: "kilovoltios",
                A: "amperios",
                mA: "miliamperios",
                kA: "kiloamperios",
                Ω: "ohmios",
                kΩ: "kiloohmios",
                MΩ: "megaohmios",
                F: "faradios",
                mF: "milifaradios",
                μF: "microfaradios",
                nF: "nanofaradios",
                pF: "picofaradios",
                H: "henrios",
                mH: "milihenrios",
                μH: "microhenrios",
                T: "teslas",
                mT: "militeslas",
                μT: "microteslas",
                Wb: "webers",
                C: "coulombios",

                // Unidades de medida
                m: "metros",
                cm: "centímetros",
                mm: "milímetros",
                km: "kilómetros",
                nm: "nanómetros",
                μm: "micrómetros",
                g: "gramos",
                kg: "kilogramos",
                mg: "miligramos",
                μg: "microgramos",
                t: "toneladas",
                L: "litros",
                mL: "mililitros",
                μL: "microlitros",
                s: "segundos",
                ms: "milisegundos",
                μs: "microsegundos",
                ns: "nanosegundos",
                min: "minutos",
                h: "horas",

                // Temperatura
                "°C": "grados celsius",
                "°F": "grados fahrenheit",
                K: "kelvin",

                // Área y volumen
                "m²": "metros cuadrados",
                "cm²": "centímetros cuadrados",
                "km²": "kilómetros cuadrados",
                "mm²": "milímetros cuadrados",
                "m³": "metros cúbicos",
                "cm³": "centímetros cúbicos",
                "mm³": "milímetros cúbicos",

                // Velocidad y aceleración
                "m/s": "metros por segundo",
                "km/h": "kilómetros por hora",
                "m/s²": "metros por segundo al cuadrado",

                // Presión
                bar: "bares",
                mbar: "milibares",
                atm: "atmósferas",
                psi: "libras por pulgada cuadrada",
                mmHg: "milímetros de mercurio",
                torr: "torr",

                // Energía y potencia adicionales
                cal: "calorías",
                kcal: "kilocalorías",
                BTU: "british thermal units",
                eV: "electron volts",
                keV: "kiloelectron volts",
                MeV: "megaelectron volts",

                // Frecuencia y rotación
                rpm: "revoluciones por minuto",
                "rad/s": "radianes por segundo",

                // Porcentaje y monedas
                "%": "por ciento",
                "€": "euros",
                $: "dólares",
                "£": "libras esterlinas",
                "¥": "yenes",

                // Ángulos
                rad: "radianes",
                sr: "estereorradianes",
                "°": "grados",
                "'": "minutos de arco",
                '"': "segundos de arco",

                // Química
                mol: "moles",
                mmol: "milimoles",
                μmol: "micromoles",
                M: "molar",
                mM: "milimolar",
                μM: "micromolar",
                pH: "pe hache",

                // Informática
                bit: "bits",
                byte: "bytes",
                KB: "kilobytes",
                MB: "megabytes",
                GB: "gigabytes",
                TB: "terabytes",
                bps: "bits por segundo",
                Mbps: "megabits por segundo",
                Gbps: "gigabits por segundo",
            },
            en: {
                // Physical units
                Pa: "pascals",
                kPa: "kilopascals",
                MPa: "megapascals",
                GPa: "gigapascals",
                N: "newtons",
                kN: "kilonewtons",
                MN: "meganewtons",
                J: "joules",
                kJ: "kilojoules",
                MJ: "megajoules",
                GJ: "gigajoules",
                W: "watts",
                kW: "kilowatts",
                MW: "megawatts",
                GW: "gigawatts",
                Hz: "hertz",
                kHz: "kilohertz",
                MHz: "megahertz",
                GHz: "gigahertz",
                V: "volts",
                mV: "millivolts",
                kV: "kilovolts",
                A: "amperes",
                mA: "milliamperes",
                kA: "kiloamperes",
                Ω: "ohms",
                kΩ: "kiloohms",
                MΩ: "megaohms",
                F: "farads",
                mF: "millifarads",
                μF: "microfarads",
                nF: "nanofarads",
                pF: "picofarads",
                H: "henries",
                mH: "millihenries",
                μH: "microhenries",
                T: "teslas",
                mT: "milliteslas",
                μT: "microteslas",
                Wb: "webers",
                C: "coulombs",

                // Measurement units
                m: "meters",
                cm: "centimeters",
                mm: "millimeters",
                km: "kilometers",
                nm: "nanometers",
                μm: "micrometers",
                g: "grams",
                kg: "kilograms",
                mg: "milligrams",
                μg: "micrograms",
                t: "tonnes",
                L: "liters",
                mL: "milliliters",
                μL: "microliters",
                s: "seconds",
                ms: "milliseconds",
                μs: "microseconds",
                ns: "nanoseconds",
                min: "minutes",
                h: "hours",

                // Temperature
                "°C": "degrees celsius",
                "°F": "degrees fahrenheit",
                K: "kelvin",

                // Area and volume
                "m²": "square meters",
                "cm²": "square centimeters",
                "km²": "square kilometers",
                "mm²": "square millimeters",
                "m³": "cubic meters",
                "cm³": "cubic centimeters",
                "mm³": "cubic millimeters",
                "€": "euros",
                "£": "pounds sterling",
                "¥": "yen",

                // Angles
                rad: "radians",
                sr: "steradians",
                "°": "degrees",
                "'": "arc minutes",
                '"': "arc seconds",

                // Chemistry
                mol: "moles",
                mmol: "millimoles",
                μmol: "micromoles",
                M: "molar",
                mM: "millimolar",
                μM: "micromolar",
                pH: "p h",

                // Computing
                bit: "bits",
                byte: "bytes",
                KB: "kilobytes",
                MB: "megabytes",
                GB: "gigabytes",
                TB: "terabytes",
                bps: "bits per second",
                Mbps: "megabits per second",
                Gbps: "gigabits per second",
            },
        };

        this.symbols = {
            es: {
                "×": "por",
                "÷": "dividido por",
                "=": "igual a",
                "≈": "aproximadamente igual a",
                "≠": "no igual a",
                "≤": "menor o igual que",
                "≥": "mayor o igual que",
                "<": "menor que",
                ">": "mayor que",
                "±": "más o menos",
                "∞": "infinito",
                "→": "tiende a",
                "←": "viene de",
                "↔": "equivale a",
                "∝": "proporcional a",
                "∴": "por lo tanto",
                "∵": "porque",
                "∑": "suma de",
                "∏": "producto de",
                "∫": "integral de",
                "∂": "derivada parcial de",
                "∇": "gradiente de",
                "∆": "delta",
                "√": "raíz cuadrada de",
                "∛": "raíz cúbica de",
                "^": "elevado a",
                π: "pi",
                e: "e",
                α: "alfa",
                β: "beta",
                γ: "gamma",
                δ: "delta",
                ε: "epsilon",
                ζ: "zeta",
                η: "eta",
                θ: "theta",
                ι: "iota",
                κ: "kappa",
                λ: "lambda",
                μ: "mu",
                ν: "nu",
                ξ: "xi",
                ο: "ómicron",
                ρ: "rho",
                σ: "sigma",
                τ: "tau",
                υ: "ípsilon",
                φ: "phi",
                χ: "chi",
                ψ: "psi",
                ω: "omega",
                Α: "alfa mayúscula",
                Β: "beta mayúscula",
                Γ: "gamma mayúscula",
                Δ: "delta mayúscula",
                Ε: "epsilon mayúscula",
                Ζ: "zeta mayúscula",
                Η: "eta mayúscula",
                Θ: "theta mayúscula",
                Ι: "iota mayúscula",
                Κ: "kappa mayúscula",
                Λ: "lambda mayúscula",
                Μ: "mu mayúscula",
                Ν: "nu mayúscula",
                Ξ: "xi mayúscula",
                Ο: "ómicron mayúscula",
                Π: "pi mayúscula",
                Ρ: "rho mayúscula",
                Σ: "sigma mayúscula",
                Τ: "tau mayúscula",
                Υ: "ípsilon mayúscula",
                Φ: "phi mayúscula",
                Χ: "chi mayúscula",
                Ψ: "psi mayúscula",
                Ω: "omega mayúscula",
            },
            en: {
                "×": "times",
                "÷": "divided by",
                "=": "equals",
                "≈": "approximately equals",
                "≠": "not equal to",
                "≤": "less than or equal to",
                "≥": "greater than or equal to",
                "<": "less than",
                ">": "greater than",
                "±": "plus or minus",
                "∞": "infinity",
                "→": "approaches",
                "←": "comes from",
                "↔": "is equivalent to",
                "∝": "proportional to",
                "∴": "therefore",
                "∵": "because",
                "∑": "sum of",
                "∏": "product of",
                "∫": "integral of",
                "∂": "partial derivative of",
                "∇": "gradient of",
                "∆": "delta",
                "√": "square root of",
                "∛": "cube root of",
                "^": "to the power of",
                π: "pi",
                e: "e",
                α: "alpha",
                β: "beta",
                γ: "gamma",
                δ: "delta",
                ε: "epsilon",
                ζ: "zeta",
                η: "eta",
                θ: "theta",
                ι: "iota",
                κ: "kappa",
                λ: "lambda",
                μ: "mu",
                ν: "nu",
                ξ: "xi",
                ο: "omicron",
                ρ: "rho",
                σ: "sigma",
                τ: "tau",
                υ: "upsilon",
                φ: "phi",
                χ: "chi",
                ψ: "psi",
                ω: "omega",
                Α: "capital alpha",
                Β: "capital beta",
                Γ: "capital gamma",
                Δ: "capital delta",
                Ε: "capital epsilon",
                Ζ: "capital zeta",
                Η: "capital eta",
                Θ: "capital theta",
                Ι: "capital iota",
                Κ: "capital kappa",
                Λ: "capital lambda",
                Μ: "capital mu",
                Ν: "capital nu",
                Ξ: "capital xi",
                Ο: "capital omicron",
                Π: "capital pi",
                Ρ: "capital rho",
                Σ: "capital sigma",
                Τ: "capital tau",
                Υ: "capital upsilon",
                Φ: "capital phi",
                Χ: "capital chi",
                Ψ: "capital psi",
                Ω: "capital omega",
            },
        };
    }

    normalize(text: string, options: TTSNormalizerOptions): string {
        // Si contiene fórmulas display (no inline), devolver vacío
        if (this.containsDisplayMath(text)) {
            return "";
        }

        const lang = options.language.includes("es") ? "es" : "en";
        let normalizedText = text;

        // Normalizar LaTeX matemático inline PRIMERO
        normalizedText = this.normalizeLatex(normalizedText, lang);

        // Normalizar código/variables en backticks
        normalizedText = this.normalizeCodeBlocks(normalizedText, lang);

        // Normalizar unidades
        normalizedText = this.normalizeUnits(normalizedText, lang);

        // Normalizar símbolos matemáticos
        normalizedText = this.normalizeSymbols(normalizedText, lang);

        // Normalizar números científicos (ej: 1.23e-4 -> 1.23 por 10 elevado a menos 4)
        normalizedText = this.normalizeScientificNotation(normalizedText, lang);

        // Normalizar fracciones (ej: 1/2 -> un medio)
        normalizedText = this.normalizeFractions(normalizedText, lang);

        // Normalizar exponentes (ej: x^2 -> x elevado al cuadrado)
        normalizedText = this.normalizeExponents(normalizedText, lang);

        // Limpiar espacios múltiples
        return normalizedText.replace(/\s+/g, " ").trim();
    }

    private containsDisplayMath(text: string): boolean {
        // Patrones para fórmulas display (NO inline)
        const displayPatterns = [
            /\\\[.*?\\\]/, // \[ ... \] - display math
            /\$\$.*?\$\$/, // $$ ... $$ - display math
        ];

        // Patrones para matrices y estructuras complejas (incluso en inline)
        const matrixPatterns = [
            /\\begin\{(pmatrix|bmatrix|vmatrix|Vmatrix|matrix)\}/i, // matrices
            /\\begin\{(array|cases|align|equation|eqnarray)\}/i, // arrays y ecuaciones complejas
            /\\end\{(pmatrix|bmatrix|vmatrix|Vmatrix|matrix)\}/i,
            /\\end\{(array|cases|align|equation|eqnarray)\}/i,
        ];

        const allPatterns = [...displayPatterns, ...matrixPatterns];
        return allPatterns.some((pattern) => pattern.test(text));
    }

    private normalizeCodeBlocks(text: string, lang: string): string {
        // Patrón para capturar texto entre backticks
        const codePattern = /`([^`]+)`/g;

        // Simplemente remover los backticks pero mantener el contenido tal como está
        return text.replace(codePattern, (match, code) => {
            return code.trim();
        });
    }

    private normalizeLatex(text: string, lang: string): string {
        const isSpanish = lang === "es";
        let result = text;

        // SOLO patrones inline - NO display math
        const inlinePatterns = [
            // \( ... \) - inline math
            /\\\((.*?)\\\)/g,
            // $ ... $ - inline math (single dollar, pero NO $)
            /(?<!\$)\$([^$]+)\$(?!\$)/g,
        ];

        inlinePatterns.forEach((pattern) => {
            result = result.replace(pattern, (match, mathContent) => {
                return this.parseMathExpression(mathContent.trim(), isSpanish);
            });
        });

        return result;
    }

    private parseMathExpression(mathExpr: string, isSpanish: boolean): string {
        let result = mathExpr;

        // 1. Normalizar subíndices: _{...} -> contenido
        result = result.replace(/_{([^}]+)}/g, (match, subscript) => {
            // Si el subíndice es \text{...}, extraer solo el contenido
            const textMatch = subscript.match(/\\text{([^}]+)}/);
            if (textMatch) {
                return ` ${textMatch[1]}`;
            }
            return ` ${subscript}`;
        });

        // 2. Normalizar superíndices: ^{...}
        result = result.replace(/\^{([^}]+)}/g, (match, exponent) => {
            const exp = exponent.replace(/[{}]/g, "").trim();
            const expNum = parseInt(exp);

            if (isSpanish) {
                if (expNum === 2) return " al cuadrado";
                if (expNum === 3) return " al cubo";
                if (expNum < 0) return ` elevado a menos ${Math.abs(expNum)}`;
                return ` elevado a ${exp}`;
            } else {
                if (expNum === 2) return " squared";
                if (expNum === 3) return " cubed";
                if (expNum < 0) return ` to the power of minus ${Math.abs(expNum)}`;
                return ` to the power of ${exp}`;
            }
        });

        // 3. Normalizar comandos de texto: \text{...} -> contenido
        result = result.replace(/\\text{([^}]+)}/g, "$1");

        // 4. Normalizar espaciado LaTeX
        result = result.replace(/\\,/g, " "); // \, -> espacio fino
        result = result.replace(/\\;/g, " "); // \; -> espacio medio
        result = result.replace(/\\:/g, " "); // \: -> espacio medio
        result = result.replace(/\\!/g, ""); // \! -> espacio negativo (eliminar)
        result = result.replace(/\\quad/g, " "); // \quad -> espacio
        result = result.replace(/\\qquad/g, "  "); // \qquad -> espacio doble

        // 5. Normalizar notación científica LaTeX: \times 10^{...}
        result = result.replace(/\\times\s*10\^{([^}]+)}/g, (match, exponent) => {
            const exp = exponent.replace(/[{}]/g, "").trim();
            const expNum = parseInt(exp);

            if (isSpanish) {
                if (expNum < 0) {
                    return `por 10 elevado a menos ${Math.abs(expNum)}`;
                } else {
                    return `por 10 elevado a ${expNum}`;
                }
            } else {
                if (expNum < 0) {
                    return `times 10 to the power of minus ${Math.abs(expNum)}`;
                } else {
                    return `times 10 to the power of ${expNum}`;
                }
            }
        });

        // 6. Normalizar fracciones: \frac{numerador}{denominador}
        result = result.replace(/\\frac{([^}]+)}{([^}]+)}/g, (match, numerator, denominator) => {
            const num = numerator.trim();
            const den = denominator.trim();

            if (isSpanish) {
                return `${num} sobre ${den}`;
            } else {
                return `${num} over ${den}`;
            }
        });

        // 7. Normalizar raíces: \sqrt{...}
        result = result.replace(/\\sqrt{([^}]+)}/g, (match, content) => {
            const inner = content.trim();

            if (isSpanish) {
                return `raíz cuadrada de ${inner}`;
            } else {
                return `square root of ${inner}`;
            }
        });

        // 8. Normalizar comandos LaTeX comunes
        const latexCommands = isSpanish
            ? {
                  "\\times": " por ",
                  "\\cdot": " por ",
                  "\\div": " dividido por ",
                  "\\pm": " más o menos ",
                  "\\mp": " menos o más ",
                  "\\approx": " aproximadamente igual a ",
                  "\\neq": " no igual a ",
                  "\\leq": " menor o igual que ",
                  "\\geq": " mayor o igual que ",
                  "\\ll": " mucho menor que ",
                  "\\gg": " mucho mayor que ",
                  "\\infty": " infinito ",
                  "\\sum": " suma de ",
                  "\\prod": " producto de ",
                  "\\int": " integral de ",
                  "\\partial": " derivada parcial de ",
                  "\\nabla": " gradiente de ",
                  "\\Delta": " delta ",
                  "\\alpha": " alfa ",
                  "\\beta": " beta ",
                  "\\gamma": " gamma ",
                  "\\delta": " delta ",
                  "\\epsilon": " épsilon ",
                  "\\theta": " theta ",
                  "\\lambda": " lambda ",
                  "\\mu": " mu ",
                  "\\pi": " pi ",
                  "\\sigma": " sigma ",
                  "\\tau": " tau ",
                  "\\phi": " phi ",
                  "\\omega": " omega ",
                  "\\left(": " ",
                  "\\right)": " ",
                  "\\left[": " ",
                  "\\right]": " ",
                  "\\left\\{": " ",
                  "\\right\\}": " ",
                  "=": " igual a ",
              }
            : {
                  "\\times": " times ",
                  "\\cdot": " times ",
                  "\\div": " divided by ",
                  "\\pm": " plus or minus ",
                  "\\mp": " minus or plus ",
                  "\\approx": " approximately equals ",
                  "\\neq": " not equal to ",
                  "\\leq": " less than or equal to ",
                  "\\geq": " greater than or equal to ",
                  "\\ll": " much less than ",
                  "\\gg": " much greater than ",
                  "\\infty": " infinity ",
                  "\\sum": " sum of ",
                  "\\prod": " product of ",
                  "\\int": " integral of ",
                  "\\partial": " partial derivative of ",
                  "\\nabla": " gradient of ",
                  "\\Delta": " delta ",
                  "\\alpha": " alpha ",
                  "\\beta": " beta ",
                  "\\gamma": " gamma ",
                  "\\delta": " delta ",
                  "\\epsilon": " epsilon ",
                  "\\theta": " theta ",
                  "\\lambda": " lambda ",
                  "\\mu": " mu ",
                  "\\pi": " pi ",
                  "\\sigma": " sigma ",
                  "\\tau": " tau ",
                  "\\phi": " phi ",
                  "\\omega": " omega ",
                  "\\left(": " ",
                  "\\right)": " ",
                  "\\left[": " ",
                  "\\right]": " ",
                  "\\left\\{": " ",
                  "\\right\\}": " ",
                  "=": " equals ",
              };

        // Aplicar reemplazos de comandos LaTeX
        Object.entries(latexCommands).forEach(([command, replacement]) => {
            const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            result = result.replace(new RegExp(escapedCommand, "g"), replacement);
        });

        // 9. Limpiar comandos LaTeX desconocidos (que empiecen con \)
        result = result.replace(/\\[a-zA-Z]+\*?/g, "");

        // 10. Limpiar llaves restantes
        result = result.replace(/[{}]/g, "");

        // 11. Limpiar espacios múltiples
        result = result.replace(/\s+/g, " ").trim();

        return result;
    }

    private normalizeUnits(text: string, lang: string): string {
        const units = this.units[lang] || this.units["en"];
        let result = text;

        // Ordenar las unidades por longitud (más largas primero) para evitar reemplazos parciales
        const sortedUnits = Object.entries(units).sort(([a], [b]) => b.length - a.length);

        sortedUnits.forEach(([unit, fullName]) => {
            const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // Para unidades de una sola letra, usar case-sensitive
            // Para unidades multi-letra, usar case-insensitive
            const isSingleLetter = unit.length === 1 && /[a-zA-Z]/.test(unit);
            const regexFlags = isSingleLetter ? "g" : "gi";

            // Patrón 1: Número seguido de unidad (ej: "5 A", "10kW")
            const numberPattern = new RegExp(
                `(\\d+(?:[.,]\\d+)?)\\s*${escapedUnit}(?=\\s|$|[.,;!?()\\]\\}\\"'\\n])`,
                regexFlags
            );

            // Patrón 2: Unidad independiente (ej: "A total", "en V")
            // Pero NO si está dentro de una palabra o variable
            const standalonePattern = new RegExp(
                `(?<=\\s|^)${escapedUnit}(?=\\s|$|[.,;!?()\\]\\}\\"'\\n])(?![a-zA-Z0-9_])`,
                regexFlags
            );

            // Aplicar patrón 1: números con unidades
            result = result.replace(numberPattern, `$1 ${fullName}`);

            // Aplicar patrón 2: unidades independientes (con verificación extra)
            result = result.replace(standalonePattern, (match, ...args) => {
                const offset = args[args.length - 2]; // posición del match
                const fullText = args[args.length - 1]; // texto completo

                // Verificar que no esté precedido por letras o guión bajo
                if (offset > 0) {
                    const prevChar = fullText[offset - 1];
                    if (/[a-zA-Z_]/.test(prevChar)) {
                        return match; // No reemplazar - es parte de una variable
                    }
                }

                return fullName;
            });
        });

        return result;
    }

    private normalizeSymbols(text: string, lang: string): string {
        const symbols = this.symbols[lang] || this.symbols["en"];
        let result = text;

        // Lista de símbolos ordenados por prioridad y complejidad
        const prioritySymbols = [
            // Primero los compuestos/complejos
            "≈",
            "≠",
            "≤",
            "≥",
            "→",
            "←",
            "↔",
            "∝",
            "∴",
            "∵",
            // Luego matemáticos básicos
            "×",
            "÷",
            "=",
            "±",
            "∞",
            // Después letras griegas
            "α",
            "β",
            "γ",
            "δ",
            "ε",
            "ζ",
            "η",
            "θ",
            "ι",
            "κ",
            "λ",
            "μ",
            "ν",
            "ξ",
            "ο",
            "π",
            "ρ",
            "σ",
            "τ",
            "υ",
            "φ",
            "χ",
            "ψ",
            "ω",
            "Α",
            "Β",
            "Γ",
            "Δ",
            "Ε",
            "Ζ",
            "Η",
            "Θ",
            "Ι",
            "Κ",
            "Λ",
            "Μ",
            "Ν",
            "Ξ",
            "Ο",
            "Π",
            "Ρ",
            "Σ",
            "Τ",
            "Υ",
            "Φ",
            "Χ",
            "Ψ",
            "Ω",
            // Por último símbolos simples
            "°",
            "%",
            // "^",
        ];

        prioritySymbols.forEach((symbol) => {
            if (symbols[symbol]) {
                const replacement = symbols[symbol];

                // Casos especiales optimizados
                if (symbol === "%") {
                    // Porcentajes: número + %
                    result = result.replace(/(\d+(?:[.,]\d+)?)\s*%/g, `$1 ${replacement}`);
                } else if (symbol === "°") {
                    // Grados: número + ° (pero no °C o °F)
                    result = result.replace(/(\d+)\s*°(?![CF])/g, `$1 ${replacement}`);
                } else {
                    // Reemplazo general con split/join (más seguro que regex)
                    result = result.split(symbol).join(` ${replacement} `);
                }
            }
        });

        // Limpiar espacios múltiples
        return result.replace(/\s+/g, " ").trim();
    }

    private normalizeScientificNotation(text: string, lang: string): string {
        const isSpanish = lang === "es";

        // Patrones para notación científica
        const patterns = [
            // 1.23e-4, 1.23E-4
            /(\d+(?:[.,]\d+)?)\s*[eE]([-+]?\d+)/g,
            // 1.23×10^-4, 1.23*10^-4
            /(\d+(?:[.,]\d+)?)\s*[×*]\s*10\^?([-+]?\d+)/g,
            // 1.23 × 10^-4 (con espacios)
            /(\d+(?:[.,]\d+)?)\s*×\s*10\s*\^?\s*([-+]?\d+)/g,
        ];

        let result = text;
        patterns.forEach((pattern) => {
            result = result.replace(pattern, (match, base, exponent) => {
                const expNum = parseInt(exponent);
                if (isSpanish) {
                    if (expNum < 0) {
                        return `${base} por 10 elevado a menos ${Math.abs(expNum)}`;
                    } else {
                        return `${base} por 10 elevado a ${expNum}`;
                    }
                } else {
                    if (expNum < 0) {
                        return `${base} times 10 to the power of minus ${Math.abs(expNum)}`;
                    } else {
                        return `${base} times 10 to the power of ${expNum}`;
                    }
                }
            });
        });

        return result;
    }

    private normalizeFractions(text: string, lang: string): string {
        const isSpanish = lang === "es";

        // Fracciones comunes
        const commonFractions = isSpanish
            ? {
                  "1/2": "un medio",
                  "1/3": "un tercio",
                  "2/3": "dos tercios",
                  "1/4": "un cuarto",
                  "3/4": "tres cuartos",
                  "1/5": "un quinto",
                  "2/5": "dos quintos",
                  "3/5": "tres quintos",
                  "4/5": "cuatro quintos",
                  "1/6": "un sexto",
                  "5/6": "cinco sextos",
                  "1/7": "un séptimo",
                  "1/8": "un octavo",
                  "3/8": "tres octavos",
                  "5/8": "cinco octavos",
                  "7/8": "siete octavos",
                  "1/9": "un noveno",
                  "1/10": "un décimo",
                  "3/10": "tres décimos",
                  "7/10": "siete décimos",
                  "9/10": "nueve décimos",
              }
            : {
                  "1/2": "one half",
                  "1/3": "one third",
                  "2/3": "two thirds",
                  "1/4": "one quarter",
                  "3/4": "three quarters",
                  "1/5": "one fifth",
                  "2/5": "two fifths",
                  "3/5": "three fifths",
                  "4/5": "four fifths",
                  "1/6": "one sixth",
                  "5/6": "five sixths",
                  "1/7": "one seventh",
                  "1/8": "one eighth",
                  "3/8": "three eighths",
                  "5/8": "five eighths",
                  "7/8": "seven eighths",
                  "1/9": "one ninth",
                  "1/10": "one tenth",
                  "3/10": "three tenths",
                  "7/10": "seven tenths",
                  "9/10": "nine tenths",
              };

        let result = text;

        // Reemplazar fracciones comunes
        Object.entries(commonFractions).forEach(([fraction, replacement]) => {
            const escapedFraction = fraction.replace("/", "\\/");
            result = result.replace(new RegExp(`\\b${escapedFraction}\\b`, "g"), replacement);
        });

        // Manejar fracciones generales (ej: 7/12)
        const fractionPattern = /\b(\d+)\/(\d+)\b/g;
        result = result.replace(fractionPattern, (match, numerator, denominator) => {
            if (isSpanish) {
                return `${numerator} sobre ${denominator}`;
            } else {
                return `${numerator} over ${denominator}`;
            }
        });

        return result;
    }

    private normalizeExponents(text: string, lang: string): string {
        const isSpanish = lang === "es";

        // Patrones para exponentes
        const patterns = [
            // x^2, x^3, etc.
            /(\w+)\^(\d+)/g,
            // x²，x³ (superíndices Unicode)
            /(\w+)([²³⁴⁵⁶⁷⁸⁹⁰¹])/g,
        ];

        // Mapeo de superíndices Unicode
        const superscriptMap: Record<string, string> = {
            "⁰": "0",
            "¹": "1",
            "²": "2",
            "³": "3",
            "⁴": "4",
            "⁵": "5",
            "⁶": "6",
            "⁷": "7",
            "⁸": "8",
            "⁹": "9",
        };

        let result = text;

        // Manejar x^n
        result = result.replace(patterns[0], (match, base, exponent) => {
            const exp = parseInt(exponent);
            if (isSpanish) {
                if (exp === 2) return `${base} al cuadrado`;
                if (exp === 3) return `${base} al cubo`;
                return `${base} elevado a ${exp}`;
            } else {
                if (exp === 2) return `${base} squared`;
                if (exp === 3) return `${base} cubed`;
                return `${base} to the power of ${exp}`;
            }
        });

        // Manejar superíndices Unicode
        result = result.replace(patterns[1], (match, base, superscript) => {
            const exp = superscriptMap[superscript] || superscript;
            const expNum = parseInt(exp);
            if (isSpanish) {
                if (expNum === 2) return `${base} al cuadrado`;
                if (expNum === 3) return `${base} al cubo`;
                return `${base} elevado a ${exp}`;
            } else {
                if (expNum === 2) return `${base} squared`;
                if (expNum === 3) return `${base} cubed`;
                return `${base} to the power of ${exp}`;
            }
        });

        return result;
    }
}

// Instancia global del normalizador
const ttsNormalizer = new TTSNormalizer();

// Función de conveniencia para usar en tu componente
export const normalizeForTTS = (text: string, language: string, domain?: string): string => {
    return ttsNormalizer.normalize(text, {
        language,
        domain: domain as any,
        preserveFormulas: false,
    });
};
