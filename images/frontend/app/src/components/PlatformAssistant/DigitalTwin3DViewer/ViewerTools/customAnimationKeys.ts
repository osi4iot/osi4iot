// The key of an object in customAnimation: its name in the glb, or the fieldName of its custom properties
// (Blender) when its animationType is "custom" (BUTTON with fieldName "buttonX" moves with customAnimation.buttonX)
export const isCustomAnimationTarget = (node: { name: string; userData?: any }, key: string) =>
    node.name === key || (node.userData?.animationType === "custom" && node.userData?.fieldName === key);

// the entry of customAnimation for a node, by its name or by its fieldName
export const customAnimationEntryFor = (node: { name: string; userData?: any }, customAnimation: any) => {
    if (!customAnimation || typeof customAnimation !== "object") return undefined;
    const byName = customAnimation[node.name];
    if (byName && typeof byName === "object") return byName;
    const field = node.userData?.animationType === "custom" ? node.userData?.fieldName : undefined;
    const byField = typeof field === "string" ? customAnimation[field] : undefined;
    return byField && typeof byField === "object" ? byField : undefined;
};
