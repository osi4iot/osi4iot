import React, { FC, useState, useEffect } from "react";
import { Field, FieldArray, ErrorMessage } from 'formik';
import styled from "styled-components";
import { useFilePicker } from 'use-file-picker';
import { OptionsType } from "react-select";
import TextError from "./TextError";
import { FaTrashAlt } from "react-icons/fa";
import { DropDown } from "./SelectControl";

const Container = styled.div`
    margin: 20px 0 0;
`;


const InputArrayStyled = styled.div`
    /* border: 2px solid #2c3235;
    border-radius: 10px; */
    /* padding: 10px; */
    width: 100%;

    & > div:not(:first-child) {
        /* height: 40px; */
        margin-right: 0;
    }
`;

const LabelsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    width: 100%;
    height: 20px;
    padding-left: 10px;
`;

interface LabelContainerProps {
    type: string;
}

const LabelContainer = styled.div<LabelContainerProps>`
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: ${props => props.type === 'email' ? '350px' : '200px'};
`;

const Label = styled.div`
    font-size: 12px;
    width: 100%;
`;

const DeleteContainer = styled.div`
    width: 20px;
`;

const Item = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
    /* height: 40px; */
`;

interface FieldContainerProps {
    type: string;
}

const FieldContainer = styled.div<FieldContainerProps>`
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    width: ${props => props.type === 'email' ? '350px' : '200px'};

    & label {
        font-size: 12px;
        width: 100%;
    }

    & input {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;

        &:focus {
            outline: none;
            box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
        }
    }

    & div {
        margin: 3px 0 0 2px;

        font-size: 12px;
        font-weight: 500;
        padding: 2px 8px;
        color: #FFFFFF;
        background: #E02F44;
        border-radius: 2px;
        position: relative;
        margin: 5px 0px 0px;

        &::before {
            content: "";
            position: absolute;
            left: 9px;
            top: -5px;
            width: 0px;
            height: 0px;
            border-width: 0px 4px 5px;
            border-color: transparent transparent #E02F44;
            border-style: solid;
        } 

    }
`;

const AddButtonsContainer = styled.div`
    display: flex;
    margin: 20px 0 10px;
    flex-direction: row;
    justify-content: space-around;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const AddButton = styled.button`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

interface AddDataFromFileButtonProps {
    localFileLoaded: boolean;
}

const AddDataFromFileButton = styled.button<AddDataFromFileButtonProps>`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
        background-color:  ${props => props.localFileLoaded ? '#3c3d40' : '#2461c0'};
        box-shadow:  ${props => props.localFileLoaded ? '0 2px #19191a' : '0 2px #173b70'};
		transform: translateY(4px);

        &:hover,
        &:focus {
            cursor:  ${props => props.localFileLoaded ? 'not-allowed' : 'pointer'};
        }
	}
`;


const RemoveButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: flex-start;
    background-color: #202226;
    width: 30px;
    height: 30px;
    padding: 10px 5px;
`;

const FaTrashAltStyled = styled(FaTrashAlt)`
    font-size: 17px;
    color: white;
 `;

const RemoveButton = styled.button`
	display: flex;
	justify-content: center;
	align-items: center;
    border: none;
    background-color: #202226;

    &:hover {
        cursor: pointer;

		& ${FaTrashAltStyled} {
			color: #e02f44;
		}
    }
`;

interface IOption {
    value: string | boolean;
    label: string;
}




const DropDownContainer = styled.div`
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    width: 200px;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }
`;

interface InitialValues {
    [key: string]: string;
}

const findOutSeperationSymbol = (text: string) => {
    let separationSymbol = "\t";
    if (text.indexOf(",") !== -1) separationSymbol = ",";
    else if (text.indexOf(";") !== -1) separationSymbol = ";";
    return separationSymbol;
}

interface InputArrayRowsProps {
    name: string;
    label: string;
    labelArray: string[];
    nameArray: string[];
    typeArray: string[];
    addLabel: string;
    inputSelectOptions?: OptionsType<IOption>;
    selectLabel: string;
    goToSelect: () => void;
}

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const filterCondition = (value: string, idx: number, typeArray: string[], allowedSelectValues: string[]) => {
    if (allowedSelectValues.length !== 0) {
        return value !== "" && (typeArray[idx] === "select" && value !== allowedSelectValues[0]);
    } else {
        return value !== "";
    }
}

const InputArrayRows: FC<InputArrayRowsProps> = (
    {
        name,
        label,
        labelArray,
        nameArray,
        typeArray,
        addLabel,
        inputSelectOptions,
        selectLabel = "",
        goToSelect = () => { },
        ...rest
    }
) => {
    const keyValueArray = nameArray.map((el, index) => {
        if (typeArray[index] === "select" && inputSelectOptions) return [el, inputSelectOptions[0].value];
        else return [el, ""];
    });
    let allowedSelectValues: string[] = [];
    if (inputSelectOptions) {
        allowedSelectValues = inputSelectOptions.map(option => option.value as string);
    }
    const initialValues: InitialValues = Object.fromEntries(keyValueArray);
    const [localFileContent, setLocalFileContent] = useState("");
    const [localFileLoaded, setLocalFileLoaded] = useState(false);
    const [localFileLabel, setLocalFileLabel] = useState("Select local file");

    const [openFileSelector, { filesContent, plainFiles, loading, clear }] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.txt,.csv',
    });

    useEffect(() => {
        if (!loading && filesContent.length !== 0 && plainFiles.length !== 0) {
            setLocalFileContent(filesContent[0].content);
            setLocalFileLoaded(true)
            setLocalFileLabel(`Add ${addLabel}s from ${plainFiles[0].name} file`);
        }
    }, [loading, filesContent, plainFiles, addLabel])


    return (
        <Container>
            <InputArrayStyled>
                <LabelsContainer>
                    {labelArray.map((item, index) => (
                        <LabelContainer key={index} type={typeArray[index]}>
                            <Label>{`${labelArray[index]}`}</Label>
                        </LabelContainer>
                    ))}
                    <DeleteContainer>
                    </DeleteContainer>
                </LabelsContainer>
                <FieldArray name={name} >
                    {(fieldArrayProps) => {
                        const { push, remove, form } = fieldArrayProps;
                        const { values } = form;
                        const valuesArray = values[name];
                        const pushFromContent = (content: string) => {
                            const lastRowValuesArray = Object.values(valuesArray[valuesArray.length - 1]);
                            if (lastRowValuesArray.filter((value, idx) => filterCondition(value as string, idx, typeArray, allowedSelectValues)).length === 0) {
                                remove(valuesArray.length - 1);
                            }
                            content.split('\r\n').forEach(register => {
                                if (register !== "") {
                                    const separationSymbol = findOutSeperationSymbol(register);
                                    const dataArray = register.split(separationSymbol);
                                    const keyValueArray = nameArray.map((el, index) => {
                                        if (dataArray[index]) {
                                            if (typeArray[index] === "select" && allowedSelectValues?.indexOf(dataArray[index]) === -1) {
                                                return [el, allowedSelectValues[0]];
                                            } else return [el, dataArray[index]];
                                        } else {
                                            if (typeArray[index] === "select" && allowedSelectValues) return [el, allowedSelectValues[0]];
                                            else return [el, ""];
                                        }
                                    });
                                    const dataValues: InitialValues = Object.fromEntries(keyValueArray);
                                    push(dataValues);
                                }
                            })
                        };

                        const localFileButtonHandler = () => {
                            if (!localFileLoaded) {
                                selectFile(openFileSelector, clear);
                            } else {
                                pushFromContent(localFileContent);
                            }
                        }
                        return (
                            <>
                                {valuesArray.map((item: any, index: number) => (
                                    <div key={index}>
                                        <Item>
                                            {labelArray.map((subitem, subIndex) => (
                                                <div key={subIndex}>
                                                    {
                                                        typeArray[subIndex] === "select" ?
                                                            <DropDownContainer >
                                                                <Field
                                                                    name={`${name}[${index}].${nameArray[subIndex]}`}
                                                                    options={inputSelectOptions}
                                                                    component={DropDown}
                                                                    placeholder="Select"
                                                                    isMulti={false}
                                                                    {...rest}
                                                                />
                                                            </DropDownContainer>
                                                            :
                                                            <FieldContainer type={typeArray[subIndex]}>
                                                                <Field name={`${name}[${index}].${nameArray[subIndex]}`} type={typeArray[subIndex]} {...rest} />
                                                                <ErrorMessage name={`${name}[${index}].${nameArray[subIndex]}`} component={TextError} />
                                                            </FieldContainer>
                                                    }
                                                </div>
                                            ))}
                                            <RemoveButtonsContainer>
                                                {
                                                    !(index === 0 && valuesArray.length === 1) &&
                                                    <RemoveButton type='button' onClick={() => remove(index)}>
                                                        <FaTrashAltStyled />
                                                    </RemoveButton>
                                                }
                                            </RemoveButtonsContainer>
                                        </Item>
                                        {
                                            index === (valuesArray.length - 1) &&
                                            <AddButtonsContainer>
                                                <AddDataFromFileButton
                                                    type='button'
                                                    localFileLoaded={localFileLoaded}
                                                    onClick={() => localFileButtonHandler()}
                                                >
                                                    {localFileLabel}
                                                </AddDataFromFileButton>
                                                {selectLabel !== "" &&  <AddButton type='button' onClick={() => goToSelect()}>Select {selectLabel}</AddButton>}
                                                <AddButton type='button' onClick={() => push(initialValues)}>Add {addLabel}</AddButton>
                                            </AddButtonsContainer>
                                        }
                                    </div>
                                ))}
                            </>
                        )
                    }}
                </FieldArray>
            </InputArrayStyled>
        </Container>

    )

}

export default InputArrayRows;