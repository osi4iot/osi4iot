// ─────────────────────────────────────────────────────────────────────────────
// Helper that generates a CodeMirror apply callback for a completion item,
// inserting `insert` and placing the cursor selection between iniChar..endChar.
// ─────────────────────────────────────────────────────────────────────────────

export const applyFunction = (insert: string, iniChar: number, endChar: number) => {
    return (
        view: {
            dispatch: (arg0: {
                changes: { from: any; to: any; insert: string };
                selection: { anchor: any; head: any };
            }) => void;
        },
        _completion: any,
        from: number,
        to: any
    ) => {
        view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + iniChar, head: from + endChar },
        });
    };
};
