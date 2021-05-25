import { FC } from "react";
import { Field, ErrorMessage } from 'formik';
import styled from "styled-components";
import TextError from "./TextError";


const InputStyled = styled.div`
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

interface InputProps {
    label: string;
    name: string;
    type: string;
}

const Input: FC<InputProps> = ({ label, name, type, ...rest }) => {
    return (
        <InputStyled>
            <label htmlFor={name}>{label}</label>
            <Field id={name} name={name} type={type} {...rest} />
            <ErrorMessage name={name} component={TextError}/>
        </InputStyled>
    )

}

export default Input;