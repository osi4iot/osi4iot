import { FileContent } from "use-file-picker/dist/interfaces";

export interface IUseFilePicker {
    filesContent: FileContent<string>[];
    loading: boolean;
    plainFiles: File[];
    clear: () => void;
}