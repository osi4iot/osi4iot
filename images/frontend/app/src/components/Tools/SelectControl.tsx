import { FC } from 'react';
import styled from "styled-components";
import { FieldProps, Field } from "formik";
import Select from "react-select";
import { OptionsType, ValueType } from "react-select";


const DropDownContainer = styled.div`
    margin: 20px 0;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }
`;

const SelectContainer = styled.div`
    width: 100%;
`;

const customStyles = {
    option: (provided: any, state: any) => ({
        ...provided,
        borderBottom: '2px solid #2c3235',
        color: 'white',
        padding: 15,
        fontSize: '14px',
        backgroundColor: '#35383d',
        "&:hover": {
            cursor: 'pointer',
            backgroundColor: '#0c0d0f',
        }
    }),
    control: (provided: any, state: any) => ({
        ...provided,
        fontSize: '14px',
        border: '2px solid #2c3235',
        backgroundColor: '#0c0d0f',
        margin: '0 auto',
        width: '100%',
        "&:hover": {
            boxShadow: 'rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px'
        }
    }),
    dropdownIndicator: (provided: any, state: any) => ({
        ...provided,
        color: 'white',
    }),
    valueContainer: (provided: any, state: any) => ({
        ...provided,
    }),      
    indicatorSeparator: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: '#2c3235',
        width: '2px'
    }),
    menu: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: '#35383d',
        width: 'calc(100% + 3px)',
    }),
    singleValue: (provided: any, state: any) => {
        const color = 'white';
        return { ...provided, color };
    }
}

interface IOption {
    value: string;
    label: string;
}

interface DropDownProps extends FieldProps {
    options: OptionsType<IOption>;
    placeholder?: string;
}

const DropDown: FC<DropDownProps> = ({ options, form, field, placeholder }) => {

    const onChange = (option: ValueType<IOption, false>) => {
        form.setFieldValue(
            field.name,
            (option as IOption).value
        );
    };

    const getValue = () => {
        if (options) {
            return options.find((option: IOption) => option.value === field.value);
        } else {
            return ("" as any);
        }
    };

    return (
        <SelectContainer>
            <Select
                styles={customStyles}
                name={field.name}
                value={getValue()}
                onChange={onChange}
                placeholder={placeholder}
                options={options}
                isMulti={false}
            />
        </SelectContainer>
    );
};

interface SelectControlProps {
    label: string;
    name: string;
    options: OptionsType<IOption>;
    type: string;
}

const SelectControl: FC<SelectControlProps> = ({ label, name, options }) => {
    return (
        <DropDownContainer>
            <label htmlFor={name}>{label}</label>
            <Field
                name={name}
                options={options}
                component={DropDown}
                placeholder="Select"
                isMulti={false}
            />
        </DropDownContainer>
    )

}


export default SelectControl;