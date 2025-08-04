export const applyFunction = (insert: string, iniChar: number, endChar: number) => {
    return (
        view: {
            dispatch: (arg0: {
                changes: { from: any; to: any; insert: string };
                selection: { anchor: any; head: any };
            }) => void;
        },
        completion: any,
        from: number,
        to: any
    ) => {
        view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + iniChar, head: from + endChar },
        });
    };
};

export interface ClassDef {
    name: string;
    methods: Method[];
    instances: any[];
}

export interface Method {
    label: string;
    type: string;
    info: string;
    detail: string;
    apply: string | ((view: any, completion: any, from: number, to: any) => void);
    source: string;
    returnType?: string;
    instanceName?: string;
}
