import { FC } from 'react';
import styled from "styled-components";
import { ISensor } from '../TableColumns/sensorsColumns';

const SensorSelectionContainer = styled.div`
    border: 3px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    margin: 0 auto 20px auto;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    background-color: #202226;
    /* adaptable: ocupa el ancho disponible y reparte los datos en varias líneas si no caben */
    width: calc(100% - 32px);
    max-width: 100%;
    flex-wrap: wrap;
    row-gap: 10px;

    @media (max-width: 600px) {
        width: 100%;
    }
`;

const ItemContainer = styled.div`
    margin: 0 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    flex: 1 1 120px;
    min-width: 0;

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
        overflow-wrap: anywhere;
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
    width: 130px;
    &:hover {
		color: #3274d9;
        border: 2px solid #3274d9;
	}
`;


interface SensorSelectionProps {
    selectedSensor: ISensor;
    showMeasurementSelectionTable: () => void;
}

const SensorSelection: FC<SensorSelectionProps> = ({ selectedSensor, showMeasurementSelectionTable }) => {
    const clickHandler = () => {
        showMeasurementSelectionTable();
    };

    return (
        <SensorSelectionContainer>
            <ItemContainer>
                <label>OrgId</label>
                <div>{selectedSensor.orgId}</div>
            </ItemContainer>
            <ItemContainer>
                <label>GroupId</label>
                <div>{selectedSensor.groupId}</div>
            </ItemContainer>
            <ItemContainer>
                <label>AssetId</label>
                <div>{selectedSensor.assetId}</div>
            </ItemContainer>            
            <ItemContainer>
                <label>Sensor name</label>
                <div>{`Sensor_${selectedSensor.sensorUid}`}</div>
            </ItemContainer>
            <ItemContainer>
                <label>Sensor description</label>
                <div>{selectedSensor.description}</div>
            </ItemContainer>
            <SelectionButton onClick={clickHandler} >Select sensor</SelectionButton>
        </SensorSelectionContainer>
    )
}

export default SensorSelection;

