import ReactModal from "react-modal";
import { useModal } from "react-modal-hook";
import styled from "styled-components";
import MiniLoader from './MiniLoader';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const DatePickerContainer = styled.div`
    width: 100%;
    height: 280px;
    display: flex;
	justify-content: center;
	align-items: center;

    .react-datepicker,
    .react-datepicker__time-list {
        background-color: #35383d;
        border: 2px solid #676d70;
    }

    .react-datepicker__month-container {
        border-right: 1px solid #aeaeae;
    }

    .react-datepicker__time-container {
        border-left: none;
    }

    .react-datepicker__time-list {
        cursor: auto;
        border: none;

        /* width */
        ::-webkit-scrollbar {
            width: 10px;
        }
    
        /* Track */
        ::-webkit-scrollbar-track {
            background: #0c0d0f;
            border-radius: 5px;
        }
        
        /* Handle */
        ::-webkit-scrollbar-thumb {
            background: #585c66; 
            border-radius: 5px;
        }
    
        /* Handle on hover */
        ::-webkit-scrollbar-thumb:hover {
            background-color: #4a4e57;
        }

        &:focus {
            outline: none;
            box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
        }
    }

    .react-datepicker__header--time {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 85px;
    }

    .react-datepicker__header,
    .react-datepicker__day-names,
    .react-datepicker__current-month,
    .react-datepicker-time__header {
        background-color: #0c0d0f;
        color: white;
    }

    .react-datepicker__header {
        height: 58px;
    }

    .react-datepicker__day-name, .react-datepicker__day, .react-datepicker__time-name {
        color: white;
    }

    .react-datepicker__day {
        &:hover {
            color: #35383d;
        }
    }

    .react-datepicker__day--selected {
        &:hover {
            color: white;
        } 
    }

    .react-datepicker__time-list-item {
        width: 70px;
        &:hover {
            color: #35383d;
        }
    }

`;


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
    margin-top: 20px;
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

const DeleteModalWithDatePicker =
    (
        title: string,
        question: string,
        consequences: string,
        action: (hideModal: () => void, selectedDate: Date) => void,
        isSubmitting: boolean = false,
        showLoader: () => void,
        selectedDate: Date,
        changeSelectedDate: (selectedDate: Date) => void,
        width: number = 370,
        height: number = 380
    ) => {


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
                <DatePickerContainer>
                    <DatePicker
                        selected={selectedDate}
                        onChange={changeSelectedDate}
                        showTimeSelect
                        inline
                        timeIntervals={15}
                        fixedHeight
                    />
                </DatePickerContainer>
                <ButtonContainer>
                    <CancelButton onClick={hideModal}>CANCEL</CancelButton>
                    <DeleteButton onClick={deleteHandler}>DELETE</DeleteButton>
                </ButtonContainer>
            </ReactModal>
        ), [isSubmitting, selectedDate]);

        const deleteHandler = () => {
            if (showLoader) showLoader();
            action(hideModal, selectedDate);
        }

        return [showModal, hideModal];
    }

export default DeleteModalWithDatePicker;
