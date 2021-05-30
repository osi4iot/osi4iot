import { FC } from "react";
import Input from "./Input";
import InputArray from "./InputArray";
import InputArrayRows from "./InputArrayRows";
import SelectControl from "./SelectControl";
import { OptionsType } from "react-select";

interface IOption {
    value: string | boolean;
    label: string;
}

interface FormikControlProps {
    control: string;
    label?: string;
    name?: string;
    type?: string;
    labelArray?: string[];
    nameArray?: string[];
    typeArray?: string[];
    addLabel?: string;
    options?: OptionsType<IOption>;
}

const FormikControl: FC<FormikControlProps> = ({ control, label, name, type, labelArray, nameArray, typeArray, addLabel, options, ...rest }) => {
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
        case 'inputArrayRows':
            return (
                <InputArrayRows
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
            return <SelectControl label={label as string} name={name as string} options={options as OptionsType<IOption>} type='text' />
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