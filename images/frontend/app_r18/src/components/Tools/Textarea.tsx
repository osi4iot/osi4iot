import { FC } from "react";
import { Field, ErrorMessage } from 'formik';
import styled from "styled-components";
import TextError from "./TextError";

interface InputStyledProps {
    textAreaSize: string;
}


const InputStyled = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'textAreaSize'
  })<InputStyledProps>`
    margin: ${props => props.textAreaSize === "Large"  ? '20px 0' : '20px 0 15px 0'};

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

    & textarea {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;
        height: ${props => props.textAreaSize === "Large"  ? '235px' : '174px'};
        resize: none;
        overflow-y: auto;
        cursor: auto;

        /* width */
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }
    
        /* Track */
        ::-webkit-scrollbar-track {
            background: #0c0d0f;
            border-radius: 5px;
        }
        
        /* Handle */
        ::-webkit-scrollbar-thumb {
            background: #2c3235;
            border-radius: 5px;
        }
    
        /* Handle on hover */
        ::-webkit-scrollbar-thumb:hover {
            background-color: #343840;
        }

        ::-webkit-scrollbar-corner {
            background: #0c0d0f;
        }

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

interface TextareaProps {
    label: string;
    name: string;
    textAreaSize: string;
    readOnly: boolean
}

const Textarea: FC<TextareaProps> = ({ label, name, textAreaSize= "Large", readOnly, ...rest }) => {
    return (
        <InputStyled textAreaSize={textAreaSize}>
            <label htmlFor={name}>{label}</label>
            <Field as='textarea' id={name} name={name} {...rest} readOnly={readOnly}/>
            <ErrorMessage name={name} component={TextError as React.ComponentType<{}>} />
        </InputStyled>
    )

}

export default Textarea;