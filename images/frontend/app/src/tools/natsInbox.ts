// Buzón NATS propio de cada usuario para las respuestas de sus peticiones (request/reply, p. ej. el servicio de
// voz de pipelines). Por defecto nats.js usa "_INBOX.<id>", pero auth_callout solo da "_INBOX.>" a los
// administradores (con él se podrían leer las respuestas de cualquiera). Cada usuario recibe permiso para
// "_INBOX_U_<login codificado>.>", y el frontend se conecta con inboxPrefix = natsInboxPrefix(login).
//
// Igual que UserInboxPrefix de auth_callout (inbox.go): letras, dígitos y "-" se quedan; cualquier otro byte
// (".", "_", "@", acentos...) pasa a "_" y sus dos cifras hexadecimales, para que sea un único token del subject
// y ningún usuario comparta prefijo con otro ("a" y "a.b").
export const natsUserSubjectToken = (userName: string): string => {
    let encoded = "";
    for (const byte of new TextEncoder().encode(userName)) {
        const c = String.fromCharCode(byte);
        encoded += /[A-Za-z0-9-]/.test(c) ? c : `_${byte.toString(16).padStart(2, "0")}`;
    }
    return encoded;
};

export const natsInboxPrefix = (userName: string): string => `_INBOX_U_${natsUserSubjectToken(userName)}`;

// El chat del gemelo digital es de cada usuario y un mensaje NATS no dice quién lo publicó (el campo "userName"
// lo puede escribir cualquiera). Por eso auth_callout da a cada usuario su propia copia de los tópicos sim2llm y
// sim2state de sus grupos, "user.<login codificado>.<tópico>", en la que solo él puede publicar: pipelines toma
// el usuario del subject. Las preguntas al AI Agent y las peticiones del historial y sus gráficas van por ahí.
export const natsUserChatSubject = (userName: string, subject: string): string =>
    `user.${natsUserSubjectToken(userName)}.${subject}`;

// Y las respuestas (llm2sim, state2sim) llegan al buzón del usuario, "<buzón>.<tópico>", que solo él puede leer.
export const natsUserInboxSubject = (userName: string, subject: string): string =>
    `${natsInboxPrefix(userName)}.${subject}`;

// Tópicos cuyas respuestas para un usuario llegan a su buzón
export const USER_PRIVATE_TOPIC_REFS = ["llm2sim", "state2sim"];
