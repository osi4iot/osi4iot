import { FC, SyntheticEvent, useState } from 'react';
import styled from "styled-components";
import FormTitle from "../../Tools/FormTitle";
import TableWithPaginationAndRowSelection from '../Utils/TableWithPaginationAndRowSelection';
import { IDigitalTwinState, ISensorState } from './GeolocationContainer';
import { findOutStatus } from './statusTools';
import { IAsset } from '../TableColumns/assetsColumns';
import { useAssetsTable } from '../../../contexts/platformAssistantContext/platformAssistantContext';
import { ISelectAsset, SELECT_ASSET_COLUMNS } from '../TableColumns/selectAssetColumns';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 20px 10px 30px 10px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    /* width: 700px; */
    height: calc(100vh - 310px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const TableContainer = styled.div`
    height: calc(100vh - 430px);
    width: 100%;
    padding: 0px 5px;
    overflow: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
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

    div:first-child {
        margin-top: 0;
    }
`;

const ButtonsContainer = styled.div`
    margin-top: 30px;
    display: flex;
    flex-direction: row;
    justify-content: space-around;
	align-items: center;
    background-color: #202226;
`;


const Button = styled.button`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 16px;
    width: 25%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}

    &:disabled {
        cursor: pointer;
        background-color: #3c3d40;
        box-shadow: 0 6px #19191a;
        color: white;

        &:hover,
        &:focus {
            cursor: not-allowed;
        }
    }
`;

const addStateToAsset = (
    asset: IAsset,
    digitalTwinsState: IDigitalTwinState[],
    sensorsState: ISensorState[],
) => {
    const digitalTwinsStateFiltered = digitalTwinsState.filter(digitalTwinState => digitalTwinState.assetId === asset.id);
    const sensorStateFiltered = sensorsState.filter(sensor => sensor.assetId === asset.id);
    const state = findOutStatus(digitalTwinsStateFiltered, sensorStateFiltered);
    const assetName = `Asset_${asset.assetUid}`;
    return { ...asset, assetName, state };
}

interface SelectAssetProps {
    groupId: number;
    backToMap: () => void;
    assetSelected: IAsset | null;
    giveAssetSelected: (asset: IAsset) => void;
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
}

const SelectAsset: FC<SelectAssetProps> = ({
    groupId,
    backToMap,
    assetSelected,
    giveAssetSelected,
    digitalTwinsState,
    sensorsState,
}) => {
    const [selectedAsset, setSelectedAsset] = useState<ISelectAsset | null>(null);
    const assetsTable = useAssetsTable();
    const assetsFiltered = assetsTable.filter(asset => asset.groupId === groupId);
    const selectAssetTable = useState(assetsFiltered.map(asset =>
        addStateToAsset(asset, digitalTwinsState, sensorsState)
    ))[0];

    const onSubmit = () => {
        if (selectedAsset) {
            const assetsTableFiltered = assetsTable.filter(asset => asset.id === selectedAsset.id);
            giveAssetSelected(assetsTableFiltered[0]);
        }
        backToMap();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setSelectedAsset(null);
        backToMap();
    };


    return (
        <>
            <FormTitle>Select device</FormTitle>
            <FormContainer>
                <TableContainer>
                    <TableWithPaginationAndRowSelection
                        dataTable={selectAssetTable}
                        columnsTable={SELECT_ASSET_COLUMNS}
                        selectedItem={assetSelected}
                        setSelectedItem={(selectedAsset: ISelectAsset) => setSelectedAsset(selectedAsset)}
                        multipleSelection={false}
                    />
                </TableContainer>
                <ButtonsContainer>
                    <Button type='button' onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type='button' onClick={onSubmit}>
                        Accept
                    </Button>
                </ButtonsContainer>
            </FormContainer>
        </>
    )
}

export default SelectAsset;