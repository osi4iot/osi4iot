// Time zones (IANA names) of the browser and the list for the forms.

const FALLBACK_TIME_ZONES = [
    "UTC",
    "Europe/Madrid",
    "Europe/London",
    "Europe/Lisbon",
    "Europe/Paris",
    "Europe/Berlin",
    "Atlantic/Canary",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Mexico_City",
    "America/Bogota",
    "America/Lima",
    "America/Santiago",
    "America/Argentina/Buenos_Aires",
    "America/Sao_Paulo",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Kolkata",
    "Australia/Sydney",
];

// The user's time zone, as the browser knows it ("" when it does not).
export function browserTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
        return "";
    }
}

export function supportedTimeZones(): string[] {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    let zones: string[] = [];
    try {
        zones = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
    } catch {
        zones = [];
    }
    if (zones.length === 0) zones = FALLBACK_TIME_ZONES;
    if (!zones.includes("UTC")) zones = ["UTC", ...zones];
    return zones;
}

// Options for a FormikControl select: "not set" first, then every zone.
export function timeZoneOptions(notSetLabel = "Not set (UTC)"): { label: string; value: string }[] {
    return [{ label: notSetLabel, value: "" }, ...supportedTimeZones().map((tz) => ({ label: tz, value: tz }))];
}
