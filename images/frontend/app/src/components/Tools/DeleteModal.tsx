import ReactModal from "react-modal";
import { useModal } from "react-modal-hook";
import styled from "styled-components";
import MiniLoader from '../Tools/MiniLoader';

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

const DeleteModal = (component: string, consequences: string, action: (hideModal: () => void) => void, isSubmitting: boolean = false, showLoader: () => void) => {
    const [showModal, hideModal] = useModal(() => (
        <ReactModal
            isOpen
            style={{
                overlay: {
                    backgroundColor: 'rgba(12, 13, 15, 0.8)',
                },
                content: {
                    top: '200px',
                    left: 'calc(50% - 160px)',
                    right: 'calc(50% - 160px)',
                    bottom: 'calc(100% - 480px)',
                    border: '2px solid #3274d9',
                    borderRadius: '20px',
                    backgroundColor: 'rgb(32, 34, 38)',
                }
            }}
            closeTimeoutMS={1000}
        >
            <TitleContainer>
                <Title>DELETE {component.toUpperCase()}</Title>
                {isSubmitting && <MiniLoader />}
            </TitleContainer>
            <ConsequencesContainer>
                <ConsequencesTitle>Consequences:</ConsequencesTitle>
                <ConsequencesText>{consequences}</ConsequencesText>
                <ConsequencesText>Are you sure to delete this {component}?</ConsequencesText>
            </ConsequencesContainer>
            <ButtonContainer>
                <CancelButton onClick={hideModal}>CANCEL</CancelButton>
                <DeleteButton onClick={deleteHandler}>DELETE</DeleteButton>
            </ButtonContainer>
        </ReactModal>
    ), [isSubmitting]);

    const deleteHandler = () => {
        if (showLoader) showLoader();
        action(hideModal);
    }

    return [showModal, hideModal];
}

export default DeleteModal;
