// Buzón NATS propio de cada usuario para las respuestas de sus peticiones (request/reply, p. ej. el servicio de
// voz de pipelines). Por defecto nats.js usa "_INBOX.<id>", pero auth_callout solo da "_INBOX.>" a los
// administradores (con él se podrían leer las respuestas de cualquiera). Cada usuario recibe permiso para
// "_INBOX_U_<login codificado>.>", y el frontend se conecta con inboxPrefix = natsInboxPrefix(login).
//
// Igual que UserInboxPrefix de auth_callout (inbox.go): letras, dígitos y "-" se quedan; cualquier otro byte
// (".", "_", "@", acentos...) pasa a "_" y sus dos cifras hexadecimales, para que sea un único token del subject
// y ningún usuario comparta prefijo con otro ("a" y "a.b").
export const natsInboxPrefix = (userName: string): string => {
    let encoded = "";
    for (const byte of new TextEncoder().encode(userName)) {
        const c = String.fromCharCode(byte);
        encoded += /[A-Za-z0-9-]/.test(c) ? c : `_${byte.toString(16).padStart(2, "0")}`;
    }
    return `_INBOX_U_${encoded}`;
};
