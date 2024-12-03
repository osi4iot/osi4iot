import { FC } from 'react';
import styled from "styled-components";
import { ITopic } from '../TableColumns/topicsColumns';

const TopicSelectionContainer = styled.div`
    border: 3px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    margin: 0 auto 20px auto;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    background-color: #202226;
`;

const ItemContainer = styled.div`
    margin: 0 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    min-width: 100px;
    width: auto;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }

    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;
    }
`;

const SelectionButton = styled.button`
    font-size: 14px;
    margin: 0 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 2px solid #2c3235;
    border-radius: 10px;
    background-color: #0c0d0f;
    color: white;
    cursor: pointer;
    padding: 10px 20px;
    width: 120px;
    &:hover {
		color: #3274d9;
        border: 2px solid #3274d9;
	}
`;


interface TopicSelectionProps {
    selectedTopic: ITopic;
    showMeasurementSelectionTable: () => void;
}

const TopicSelection: FC<TopicSelectionProps> = ({ selectedTopic, showMeasurementSelectionTable }) => {
    const clickHandler = () => {
        showMeasurementSelectionTable();
    };

    return (
        <TopicSelectionContainer>
            <ItemContainer>
                <label>OrgId</label>
                <div>{selectedTopic.orgId}</div>
            </ItemContainer>
            <ItemContainer>
                <label>GroupId</label>
                <div>{selectedTopic.groupId}</div>
            </ItemContainer>
            <ItemContainer>
                <label>Type</label>
                <div>{selectedTopic.topicType}</div>
            </ItemContainer>            
            <ItemContainer>
                <label>Topic name</label>
                <div>{`Topic_${selectedTopic.topicUid}`}</div>
            </ItemContainer>
            <SelectionButton onClick={clickHandler} >Select topic</SelectionButton>
        </TopicSelectionContainer>
    )
}

export default TopicSelection;

