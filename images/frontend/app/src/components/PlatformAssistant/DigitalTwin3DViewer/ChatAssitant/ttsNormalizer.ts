import { containsLatex } from "./KatexRenderer";

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
        if (containsLatex(text)) {
            return "";
        }

        const lang = options.language.includes("es") ? "es" : "en";
        let normalizedText = text;

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

    private normalizeUnits(text: string, lang: string): string {
        const units = this.units[lang] || this.units["en"];
        let result = text;

        // Ordenar las unidades por longitud (más largas primero) para evitar reemplazos parciales
        const sortedUnits = Object.entries(units).sort(([a], [b]) => b.length - a.length);

        sortedUnits.forEach(([unit, fullName]) => {
            const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // Patrones para diferentes casos:
            // 1. Número + espacio + unidad
            // 2. Número + unidad directamente pegada
            // 3. Unidad al inicio de palabra (para casos como "pH")
            const patterns = [
                new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${escapedUnit}(?=\\s|$|[.,;!?()\\]\\}\\"'])`, "gi"),
                new RegExp(`(?<=\\s|^)${escapedUnit}(?=\\s|$|[.,;!?()\\]\\}\\"'])`, "gi"),
            ];

            patterns.forEach((pattern, index) => {
                if (index === 0) {
                    // Para números con unidades
                    result = result.replace(pattern, `$1 ${fullName}`);
                } else {
                    // Para unidades independientes
                    result = result.replace(pattern, fullName);
                }
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
            "^",
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
                } else if (symbol === "^") {
                    // Exponentes: mantener contexto
                    result = result.replace(/\^(\d+)/g, ` ${replacement} $1`);
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
