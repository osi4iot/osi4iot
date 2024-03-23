import { FC, SyntheticEvent } from "react";
import styled from "styled-components";

const DataBaseRemoveIcon = () => {
    return (
        <svg viewBox="0 0 60 60" width="20" height="20" fill="white">
            <path d="M44,30A14,14,0,1,0,58,44,14.015,14.015,0,0,0,44,30Zm6.707,19.293a1,1,0,1,1-1.414,1.414L44,45.414l-5.293,5.293a1,1,0,0,1-1.414-1.414L42.586,44l-5.293-5.293a1,1,0,0,1,1.414-1.414L44,42.586l5.293-5.293a1,1,0,0,1,1.414,1.414L45.414,44Z" /><path d="M40,11.561C36.409,14.464,28.532,16,21,16S5.591,14.464,2,11.561V20c0,2.838,7.8,6,19,6s19-3.162,19-6ZM6.929,19a1,1,0,0,1-1.3.56q-.55-.219-1.054-.453a1,1,0,0,1,.846-1.813q.45.211.946.407A1,1,0,0,1,6.929,19Zm5.051,1.262a1,1,0,0,1-.979.8.967.967,0,0,1-.2-.02q-.524-.105-1.026-.221a1,1,0,1,1,.448-1.949c.319.073.643.143.974.21A1,1,0,0,1,11.98,20.262Z" /><path d="M2,23.561V32c0,2.838,7.8,6,19,6a52.43,52.43,0,0,0,8.48-.678A16.041,16.041,0,0,1,40,28.527V23.561C36.409,26.464,28.532,28,21,28S5.591,26.464,2,23.561Z" /><ellipse cx="21" cy="8" rx="19" ry="6" /><path d="M21,50a52.235,52.235,0,0,0,7.957-.6,15.747,15.747,0,0,1-.294-9.927A54.759,54.759,0,0,1,21,40c-7.532,0-15.409-1.536-19-4.439V44C2,46.838,9.8,50,21,50Z" />
        </svg>
    );
};

const DataBaseRemoveIconStyled = styled(DataBaseRemoveIcon)`
    font-size: 18px;
    color: white;
`;

interface DataBaseRemoveProps {
    rowIndex: number
}

const DataBaseRemoveWrapper = styled.div<DataBaseRemoveProps>`
    ${DataBaseRemoveIconStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;


const IconContainer = styled.div<DataBaseRemoveProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

        svg {
            fill: red;
        }
    }
`;

interface RemoveDTLocalStorageIconProps {
    action: any;
    rowIndex: number;
    numGltfFilesLocallyStored: number;
    numFemResFilesLocallyStored: number;
}

const RemoveDTLocalStorageIcon: FC<RemoveDTLocalStorageIconProps> = ({
    action,
    rowIndex,
    numGltfFilesLocallyStored,
    numFemResFilesLocallyStored,
}) => {
    const handleClick = (e: SyntheticEvent) => {
        if (numGltfFilesLocallyStored !== 0 ||
            numFemResFilesLocallyStored !== 0
        ) {
            action();
        }
    };
    
    return (
        <IconContainer onClick={handleClick} rowIndex={rowIndex}>
            <DataBaseRemoveWrapper rowIndex={rowIndex} >
                <DataBaseRemoveIconStyled />
            </DataBaseRemoveWrapper>
        </IconContainer>
    );
};

export default RemoveDTLocalStorageIcon;