import { FC, useRef } from 'react';
import styled from "styled-components";
import { FieldProps, Field } from "formik";
import Select, { Options, SingleValue } from "react-select";


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
        padding: 10,
        fontSize: '14px',
        height: '40px',
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
        height: 30,
        minHeight: 30,
        borderRadius: 0,
        "&:hover": {
            boxShadow: 'rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px'
        },
        "& > div": {
            height: 26,
            minHeight: 26,
            padding: '2px 0'
        },        
        "& > div > div": {
            padding: '5px'
        }
    }),
    dropdownIndicator: (provided: any, state: any) => ({
        ...provided,
        color: 'white',
    }),
    valueContainer: (provided: any, state: any) => ({
        ...provided,
        "& > div > div": {
            opacity: '0'
        }
    }),
    indicatorsContainer: (provided: any, state: any) => ({
        ...provided,
        height: 26,
        minHeight: 26,
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
    menuList: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: '#35383d',
        "::-webkit-scrollbar": {
            width: "7px",
            height: "0px",
        },
        "::-webkit-scrollbar-track": {
            background: "#202226",
            borderRadius: "3px"
        },
        "::-webkit-scrollbar-thumb": {
            background: "#2c3235",
            borderRadius: "3px"
        },
        "::-webkit-scrollbar-thumb:hover": {
            background: "#424b4f"
        }
    }),
    singleValue: (provided: any, state: any) => {
        const color = 'white';
        return { ...provided, color };
    }
}

interface IOption {
    value: string | boolean;
    label: string;
}

interface DropDownProps extends FieldProps {
    options: Options<IOption>;
    placeholder?: string;
}

// The class prefix of the selects' parts (osi-select__menu...), to find
// the menu when it opens.
const CLASS_PREFIX = "osi-select";

// The box that scrolls around an element: the form's controls, a panel.
const scrollParentOf = (element: HTMLElement): HTMLElement | null => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const { overflowY } = window.getComputedStyle(parent);
        if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
            return parent;
        }
    }
    return null;
};

// When a menu opens below the visible part of the box that scrolls around
// it (a long list, or a select near the bottom of a form), the box scrolls
// so that the whole menu can be seen. react-select only does it when the
// menu goes beyond the window, not beyond that box.
const scrollMenuIntoView = (container: HTMLElement | null) => {
    if (!container) return;
    // After react-select has rendered the menu.
    window.requestAnimationFrame(() => {
        const menu = container.querySelector<HTMLElement>(`.${CLASS_PREFIX}__menu`);
        if (!menu) return;
        const box = scrollParentOf(container);
        if (!box) return;
        const menuRect = menu.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        const below = menuRect.bottom + 8 - boxRect.bottom;
        if (below > 0) {
            // Never so far that the select itself goes out at the top.
            const room = container.getBoundingClientRect().top - boxRect.top;
            box.scrollBy({ top: Math.min(below, Math.max(room, 0)), behavior: "smooth" });
        }
    });
};

export const DropDown: FC<DropDownProps> = ({ options, form, field, placeholder, ...rest }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const onChange = (option: SingleValue<IOption>) => {
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
        <SelectContainer ref={containerRef}>
            <Select
                classNamePrefix={CLASS_PREFIX}
                onMenuOpen={() => scrollMenuIntoView(containerRef.current)}
                styles={customStyles}
                name={field.name}
                value={getValue()}
                onChange={onChange}
                placeholder={placeholder}
                options={options}
                isMulti={false}
                isSearchable={false}
                blurInputOnSelect={true}
                {...rest}
            />
        </SelectContainer>
    );
};

interface SelectControlProps {
    label: string;
    name: string;
    options: Options<IOption>;
    autoFocus: boolean;
}

const SelectControl: FC<SelectControlProps> = ({ label, name, options,autoFocus=false, ...rest }) => {
    return (
        <DropDownContainer>
            {label!== "" && <label htmlFor={name}>{label}</label>}
            <Field
                name={name}
                options={options}
                component={DropDown}
                placeholder="Select"
                isMulti={false}
                autoFocus={autoFocus}
                {...rest}
            />
        </DropDownContainer>
    )

}

export default SelectControl;