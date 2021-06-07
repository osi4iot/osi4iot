import { useState } from 'react';
import ReactModal from "react-modal";
import { useModal } from "react-modal-hook";
import styled from "styled-components";
import MiniLoader from '../Tools/MiniLoader';
import Select, { OptionsType, ValueType } from "react-select";

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
    singleValue: (provided: any, state: any) => {
        const color = 'white';
        return { ...provided, color };
    }
}

interface IOption {
    value: string;
    label: string;
}

const TitleContainer = styled.div`
	display: flex;
    flex-direction: row;
	justify-content: center;
	align-items: center;
`;

const Title = styled.div`
    font-size: 20px;
    text-align: center;
    font-weight: 500;
    width: 100%;
    background-color: #202226;
`;

const ConsequencesContainer = styled.div`
    margin-top: 20px;
    width: 100%;
    height: 120px;
    background-color: #202226;
`;


const ConsequencesTitle = styled.div`
    font-size: 16px;
    background-color: #202226;    
`;

const ConsequencesText = styled.p`
    margin-top: 10px;
    font-size: 14px;
    background-color: #202226;    
`;


const ButtonContainer = styled.div`
    margin-top: 100px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    background-color: #202226;    
`;

const CancelButton = styled.button`
    font-size: 14px;
    background-color: #3274d9;
    padding: 10px 20px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    outline: none;
    cursor: pointer;
    box-shadow: 0 5px #173b70;
    padding: 10px 20px;
    font-weight: 600;

    &:hover {
        background-color: #2461c0;
    }

    &:active {
        background-color: #2461c0;
        box-shadow: 0 2px #173b70;
        transform: translateY(4px);
    }
`;

const DeleteButton = styled.button`
    font-size: 14px;
    background-color: #e02f44;
    padding: 10px 20px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    outline: none;
    cursor: pointer;
    box-shadow: 0 5px #57131b;
    padding: 10px 20px;
    font-weight: 600;

    &:hover {
        background-color: #c22b3d;
    }

    &:active {
        background-color: #c22b3d;
        box-shadow: 0 2px #173b70;
        transform: translateY(4px);
    }
`;

const DeleteModalWithSelect =
    (
        title: string,
        question: string,
        consequences: string,
        action: (hideModal: () => void, whoToRemove: string) => void,
        isSubmitting: boolean = false,
        showLoader: () => void,
        options: OptionsType<IOption>,
        width: number = 370,
        height: number = 380
    ) => {
        const [selectedOption, setSelectedOption] = useState<IOption>(options[0]);

        const [showModal, hideModal] = useModal(() => (
            <ReactModal
                isOpen
                style={{
                    overlay: {
                        backgroundColor: 'rgba(12, 13, 15, 0.8)',
                    },
                    content: {
                        top: '200px',
                        left: `calc(50% - ${width / 2}px)`,
                        right: `calc(50% - ${width / 2}px)`,
                        bottom: `calc(100% - 200px - ${height}px)`,
                        border: '2px solid #3274d9',
                        borderRadius: '20px',
                        backgroundColor: 'rgb(32, 34, 38)',
                    }
                }}
                closeTimeoutMS={1000}
            >
                <TitleContainer>
                    <Title>{title}</Title>
                    {isSubmitting && <MiniLoader />}
                </TitleContainer>
                <ConsequencesContainer>
                    <ConsequencesTitle>Consequences:</ConsequencesTitle>
                    <ConsequencesText>{consequences}</ConsequencesText>
                    <ConsequencesText>{question}</ConsequencesText>
                </ConsequencesContainer>
                <SelectContainer>
                    <Select
                        styles={customStyles}
                        value={selectedOption}
                        onChange={onChange}
                        options={options}
                    />
                </SelectContainer>
                <ButtonContainer>
                    <CancelButton onClick={hideModal}>CANCEL</CancelButton>
                    <DeleteButton onClick={deleteHandler}>DELETE</DeleteButton>
                </ButtonContainer>
            </ReactModal>
        ), [isSubmitting, selectedOption]);

        const deleteHandler = () => {
            if (showLoader) showLoader();
            action(hideModal, (selectedOption as IOption)?.value);
        }

        const onChange = (option: ValueType<IOption, false>) => {
            setSelectedOption(option as IOption);
        };


        return [showModal, hideModal];
    }

export default DeleteModalWithSelect;
