// The NATS subjects the server has refused to the user (permission violations): auth_callout gives each user
// the subjects of the groups they belong to, when they connect. A refusal is not a lost connection: the other
// subscriptions keep working. The viewer shows a notice with what was refused and what to do.
import { useEffect, useState } from "react";
import { PermissionViolationError } from "@nats-io/nats-core";

export interface DeniedSubject {
    subject: string;
    // "subscription" or "publish"
    operation: string;
    at: number;
}

export const isPermissionViolation = (err: unknown): err is PermissionViolationError =>
    err instanceof PermissionViolationError || (err as { name?: string } | null)?.name === "PermissionViolationError";

const denied = new Map<string, DeniedSubject>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// note a refusal; true when it is new (the same subject and operation are noted once)
export const reportPermissionViolation = (err: unknown, now: number = Date.now()): boolean => {
    if (!isPermissionViolation(err)) return false;
    const operation = (err.operation || "subscription").toLowerCase();
    const key = `${operation} ${err.subject}`;
    if (denied.has(key)) return false;
    denied.set(key, { subject: err.subject, operation, at: now });
    // eslint-disable-next-line no-console
    console.warn(`NATS: no permission for ${operation} to "${err.subject}"`);
    notify();
    return true;
};

export const deniedSubjects = (): DeniedSubject[] => Array.from(denied.values());

export const clearPermissionViolations = () => {
    if (denied.size === 0) return;
    denied.clear();
    notify();
};

export const onPermissionViolation = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const usePermissionViolations = (): DeniedSubject[] => {
    const [list, setList] = useState<DeniedSubject[]>(deniedSubjects);
    useEffect(() => {
        setList(deniedSubjects());
        return onPermissionViolation(() => setList(deniedSubjects()));
    }, []);
    return list;
};

// the topic of a subject, as the user knows it: "dtm2sim.Group_x.Topic_y" -> "dtm2sim",
// "_INBOX_U_name.llm2sim.Group_x.Topic_y" -> "llm2sim (private)"
export const topicKindOf = (subject: string): string => {
    const parts = subject.split(".");
    if (parts[0].startsWith("_INBOX")) return parts[1] ? `${parts[1]} (private)` : "inbox";
    if (parts[0] === "user" && parts.length > 2) return `${parts[2]} (private)`;
    return parts[0];
};
