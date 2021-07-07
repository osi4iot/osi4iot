import { FC } from "react";
import Input from "./Input";
import InputArray from "./InputArray";
import InputArrayRows from "./InputArrayRows";
import SelectControl from "./SelectControl";
import { OptionsType } from "react-select";
import Textarea from "./Textarea";

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
    selectLabel?: string;
    goToSelect?: () => void;
    options?: OptionsType<IOption>;
    autoFocus?: boolean;
    onChange?: (e: any) => void;
}

const FormikControl: FC<FormikControlProps> = ({ control, label, name, type, labelArray, nameArray, typeArray, addLabel, selectLabel, goToSelect, options, autoFocus, ...rest }) => {
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
                    selectLabel={selectLabel as string}
                    goToSelect={goToSelect as () => void}
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
                    inputSelectOptions={options as OptionsType<IOption>}
                    selectLabel={selectLabel as string}
                    goToSelect={goToSelect as () => void}
                    {...rest}
                />
            )
        case 'textarea':
            return <Textarea label={label as string} name={name as string} {...rest}/>
        case 'select':
            return <SelectControl label={label as string} name={name as string} options={options as OptionsType<IOption>} autoFocus={ autoFocus as boolean} {...rest} />
        default: return null;
    }
}

export default FormikControl;