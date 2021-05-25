import { FC } from "react";
import Input from "./Input";
import InputArray from "./InputArray";


interface FormikControlProps {
    control: string;
    label?: string;
    name?: string;
    type?: string;
    labelArray?: string[];
    nameArray?: string[];
    typeArray?: string[];
    addLabel?: string;
}

const FormikControl: FC<FormikControlProps> = ({ control, label, name, type, labelArray, nameArray, typeArray, addLabel, ...rest }) => {
    switch (control) {
        case 'input':
            return <Input label={label as string} name={name as string} type={type as string} {...rest} />
        case 'inputArray':
            return (
                <InputArray
                    label={label as string}
                    name={name as string}
                    labelArray={labelArray as string[]}
                    typeArray={typeArray as string[]}
                    nameArray={nameArray as string[]}
                    addLabel={addLabel as string}
                    {...rest}
                />
            )
        case 'textarea':
            break;
        case 'select':
            break;
        case 'radio':
            break;
        case 'checkbox':
            break;
        case 'date':
            break;
        default: return null;
    }
    return null;
}

export default FormikControl;