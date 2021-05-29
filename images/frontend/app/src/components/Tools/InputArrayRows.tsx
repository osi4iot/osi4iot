import { FC } from "react";
import { Field, FieldArray, ErrorMessage } from 'formik';
import styled from "styled-components";
import TextError from "./TextError";
import { FaTrashAlt } from "react-icons/fa";


const Container = styled.div`
    margin: 20px 0 0;
`;


const InputArrayStyled = styled.div`
    /* border: 2px solid #2c3235;
    border-radius: 10px; */
    /* padding: 10px; */
    width: 100%;

    & > div:not(:first-child) {
        height: 40px;
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

const LabelContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 200px;
`;

const Label = styled.div`
    font-size: 12px;
    width: 100%;
`;

const DeleteContainer = styled.div`
    font-size: 12px;
    width: 30px;
`;

const Item = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    width: 100%;
    height: 40px;
`;

const FieldContainer = styled.div`
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 200px;

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
    justify-content: center;
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

const RemoveButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
	align-items: center;
    background-color: #202226;
    width: 30px;
    height: 30px;
    margin-left: 5px;
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


interface InputArrayRowsProps {
    name: string;
    label: string;
    labelArray: string[];
    nameArray: string[];
    typeArray: string[];
    addLabel: string;
}

interface InitialValues {
    [key: string]: string;
}

const InputArrayRows: FC<InputArrayRowsProps> = ({ name, label, labelArray, nameArray, typeArray, addLabel }) => {
    const keyValueArray = nameArray.map(el => [el, ""]);
    const initialValues: InitialValues = Object.fromEntries(keyValueArray);
    return (
        <Container>
            <InputArrayStyled>
                <LabelsContainer>
                    {labelArray.map((item, index) => (
                        <LabelContainer key={index}>
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
                        return (
                            <>
                                {valuesArray.map((item: any, index: number) => (
                                    <div key={index}>
                                        <Item>
                                            {labelArray.map((subitem, subIndex) => (
                                                <FieldContainer key={subIndex}>
                                                    {/* <label htmlFor={`${nameArray[subIndex]}`}>{`${labelArray[subIndex]}`}</label> */}
                                                    <Field name={`${name}[${index}].${nameArray[subIndex]}`} type={typeArray[subIndex]} />
                                                    <ErrorMessage name={`${name}[${index}].${nameArray[subIndex]}`} component={TextError} />
                                                </FieldContainer>
                                            ))}
                                            <RemoveButtonsContainer>
                                                {
                                                    !(index === 0 && valuesArray.length === 1) &&
                                                    <RemoveButton type='button' onClick={() => remove(index)}>
                                                        <FaTrashAltStyled/>
                                                    </RemoveButton>
                                                }
                                            </RemoveButtonsContainer>
                                        </Item>
                                        <AddButtonsContainer>
                                            {
                                                index === (valuesArray.length - 1) &&
                                                <AddButton type='button' onClick={() => push(initialValues)}>Add {addLabel}</AddButton>
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

export default InputArrayRows;