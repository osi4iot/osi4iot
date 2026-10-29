// Extensiones aceptadas por un campo de archivo (".gltf", ".yml, .yaml", [".json", ".bin"]).

export const acceptList = (accept: string | string[] | undefined): string[] =>
    (Array.isArray(accept) ? accept : (accept ?? "").split(","))
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item !== "" && item !== "*");

// ¿Es el archivo de un tipo aceptado? (por extensión; los tipos MIME "image/*", "image/svg+xml" por su tipo)
export const matchesAccept = (file: File, accept: string | string[] | undefined): boolean => {
    const items = acceptList(accept);
    if (items.length === 0) return true;
    const name = file.name.toLowerCase();
    const type = (file.type || "").toLowerCase();
    return items.some((item) => {
        if (item.startsWith(".")) return name.endsWith(item);
        if (item.endsWith("/*")) return type.startsWith(item.slice(0, -1));
        return type === item;
    });
};

// ".json, .yaml" -> ".json or .yaml files"
export const acceptLabel = (accept: string | string[] | undefined): string => {
    const items = acceptList(accept);
    if (items.length === 0) return "any file";
    if (items.length === 1) return `${items[0]} files`;
    return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]} files`;
};
