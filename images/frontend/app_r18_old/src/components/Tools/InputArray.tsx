import { FC } from "react";
import { Field, FieldArray, ErrorMessage } from 'formik';
import styled from "styled-components";
import TextError from "./TextError";


const Container = styled.div`
    margin: 20px 0 0;
`;

const Title = styled.div`
    margin-bottom: 5px;
`;

const InputArrayStyled = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
`;

const Item = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    margin: 10px 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
`;

const FieldContainer = styled.div`
    padding: 10px;
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
    margin: 10px 0 10px;
    flex-direction: row;
    justify-content: space-between;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const AddButton = styled.button`
	background-color: #3274d9;
	padding: 5px 10px;
    margin: 10px 10px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;
    width: 40%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const RemoveButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const RemoveButton = styled.button`
	background-color: #e02f44;
	padding: 5px 10px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
    font-size: 14px;
`;


interface InputArrayProps {
    name: string;
    label: string;
    labelArray: string[];
    nameArray: string[];
    typeArray: string[];
    addLabel: string;
    selectLabel: string;
    goToSelect: () => void;
}

interface InitialValues {
    [key: string]: string;
}

const InputArray: FC<InputArrayProps> = ({ name, label, labelArray, nameArray, typeArray, addLabel, selectLabel, goToSelect, ...rest }) => {
    const keyValueArray = nameArray.map(el => [el, ""]);
    const initialValues: InitialValues = Object.fromEntries(keyValueArray);
    return (
        <Container>
            <Title>{label}</Title>
            <InputArrayStyled>
                <FieldArray name={name} >
                    {(fieldArrayProps) => {
                        const { push, remove, form } = fieldArrayProps;
                        const { values } = form;
                        const valuesArray = values[name];
                        return (
                            <>
                                {valuesArray.map((item: any, index: number) => (
                                    <div key={`${name}_${index}`}>
                                        <Item>
                                            <RemoveButtonsContainer>
                                                {
                                                    !(index === 0 && valuesArray.length === 1) &&
                                                    <RemoveButton type='button' onClick={() => remove(index)}>x</RemoveButton>
                                                }
                                            </RemoveButtonsContainer>
                                            {labelArray.map((subitem, subIndex) => (
                                                <FieldContainer key={`${name}_${index}_${subIndex}`}>
                                                    <label htmlFor={`${nameArray[subIndex]}`}>{`${labelArray[subIndex]}`}</label>
                                                    <Field name={`${name}[${index}].${nameArray[subIndex]}`} type={typeArray[subIndex]} {...rest}/>
                                                    <ErrorMessage
                                                        name={`${name}[${index}].${nameArray[subIndex]}`}
                                                        component={TextError as React.ComponentType<{}>}
                                                    />
                                                </FieldContainer>
                                            ))}
                                        </Item>
                                        <AddButtonsContainer>
                                            {
                                                index === (valuesArray.length - 1) &&
                                                <>
                                                    <AddButton type='button' onClick={() => push(initialValues)}>Add {addLabel}</AddButton>
                                                    <AddButton type='button' onClick={() => goToSelect()}>Select {selectLabel}</AddButton>
                                                </>
                                            }
                                        </AddButtonsContainer>
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

export default InputArray;