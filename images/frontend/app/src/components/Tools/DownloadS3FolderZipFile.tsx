import ReactModal from "react-modal";
import { useModal } from "react-modal-hook";
import styled from "styled-components";
import MiniLoader from "../Tools/MiniLoader";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const DatePickerContainer = styled.div`
    flex: 1;

    .react-datepicker {
        background-color: #2a2d33;
        border: 0.5px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        font-family: inherit;
        width: 100%;
        box-shadow: none;
    }

    .react-datepicker__month-container {
        float: none;
    }

    .react-datepicker__header {
        background-color: #1a1c20;
        border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
        padding: 10px 0 8px;
    }

    .react-datepicker__current-month {
        font-size: 12px;
        font-weight: 500;
        color: white;
    }

    .react-datepicker__day-name {
        font-size: 10px;
        color: white;
        width: 28px;
        line-height: 24px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .react-datepicker__day {
        font-size: 11px;
        color: #ddd;
        width: 28px;
        line-height: 28px;
        border-radius: 50%;
        transition: background 0.1s;

        &:hover {
            background: rgba(255, 255, 255, 0.3);
        }
    }

    .react-datepicker__day--selected {
        background-color: #3274d9 !important;
        color: #fff !important;
        font-weight: 500;
        border-radius: 50%;
    }

    .react-datepicker__day--outside-month {
        color: #838282;

        &:hover {
            background: rgba(255, 255, 255, 0.1);
        }
    }

    .react-datepicker__day.future-day {
        color: #838282;
        cursor: not-allowed;

        &:hover {
            background: rgba(255, 255, 255, 0.1);
        }
    }

    .react-datepicker__navigation-icon::before {
        border-color: #bbb;
        border-width: 1.5px 1.5px 0 0;
        width: 6px;
        height: 6px;
    }

    .react-datepicker__time-container {
        border-left: 0.5px solid rgba(0, 0, 0, 0.08);
        width: 80px;
    }

    .react-datepicker__time-list {
        background: #fff;
    }

    .react-datepicker__time-list-item {
        font-size: 11px;
        color: #555;
        padding: 5px 8px !important;
        height: auto !important;

        &:hover {
            background: #f5f5f5 !important;
        }
        &--selected {
            background: #111 !important;
            color: #fff !important;
            font-weight: 500;
        }
    }

    .react-datepicker-time__header {
        font-size: 10px;
        color: #aaa;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 400;
    }
`;

const Row = styled.div`
    display: flex;
    gap: 20px;

    @media (max-width: 560px) {
        flex-direction: column;
    }
`;

const Col = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Label = styled.p`
    margin: 0;
    font-size: 11px;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.06em;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
`;

const Title = styled.h2`
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    color: white;
`;

const CloseBtn = styled.button`
    background: none;
    border: none;
    font-size: 18px;
    color: #bbb;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    &:hover {
        color: #666;
    }
`;

const Footer = styled.div`
    display: flex;
    justify-content: space-around;
    gap: 8px;
    margin-top: 28px;
    padding-top: 20px;
    border-top: 0.5px solid rgba(0, 0, 0, 0.08);
`;

const Button = styled.button`
    font-size: 15px;
    font-weight: 500;
    padding: 8px 15px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    background: #3274d9;
    color: #fff;
    cursor: pointer;
    &:hover {
        background: #2563c0;
    }
    &:active {
        transform: scale(0.98);
    }
`;

const DownloadS3FolderZipFile = (
    action: (hideModal: () => void, initDate: Date, finalDate: Date) => void,
    isSubmitting: boolean = false,
    showLoader: () => void,
    selectedInitDate: Date,
    changeSelectedInitDate: (d: Date) => void,
    selectedFinalDate: Date,
    changeSelectedFinalDate: (d: Date) => void,
) => {
    const today = new Date();
    const [showModal, hideModal] = useModal(
        () => (
            <ReactModal
                isOpen
                style={{
                    overlay: {
                        backgroundColor: 'rgba(12, 13, 15, 0.8)',
                        zIndex: 1000,
                    },
                    content: {
                        top: "50%",
                        left: "50%",
                        right: "auto",
                        bottom: "auto",
                        transform: "translate(-50%,-50%)",
                        width: "560px",
                        maxWidth: "calc(100vw - 32px)",
                        border: "2px solid #3274d9",
                        borderRadius: "12px",
                        backgroundColor: "#202226",
                        padding: "28px",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                    },
                }}
                closeTimeoutMS={150}
            >
                <Header>
                    <Title>Download S3 folder in zip file</Title>
                    {isSubmitting ? <MiniLoader /> : <CloseBtn onClick={hideModal}>×</CloseBtn>}
                </Header>

                <Row>
                    <Col>
                        <Label>Start date</Label>
                        <DatePickerContainer>
                            <DatePicker
                                selected={selectedInitDate}
                                onChange={changeSelectedInitDate}
                                inline
                                fixedHeight
                                filterDate={(date) => date <= today}
                                dayClassName={(date) => (date > today ? "future-day" : null)}
                            />
                        </DatePickerContainer>
                    </Col>
                    <Col>
                        <Label>End date</Label>
                        <DatePickerContainer>
                            <DatePicker
                                selected={selectedFinalDate}
                                onChange={changeSelectedFinalDate}
                                inline
                                fixedHeight
                                filterDate={(date) => date <= today}
                                dayClassName={(date) => (date > today ? "future-day" : null)}
                            />
                        </DatePickerContainer>
                    </Col>
                </Row>

                <Footer>
                    <Button onClick={hideModal}>Cancel</Button>
                    <Button onClick={downloadHandler}>Download</Button>
                </Footer>
            </ReactModal>
        ),
        [isSubmitting, selectedInitDate, selectedFinalDate],
    );

    const downloadHandler = () => {
        if (showLoader) showLoader();
        action(hideModal, selectedInitDate, selectedFinalDate);
    };

    return [showModal, hideModal];
};

export default DownloadS3FolderZipFile;
