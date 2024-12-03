import { FC, SyntheticEvent } from "react";
import styled from "styled-components";

const DataBaseRemoveIcon = () => {
    return (
        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg"><path d="M8 1c-1.573 0-3.022.289-4.096.777C2.875 2.245 2 2.993 2 4s.875 1.755 1.904 2.223C4.978 6.711 6.427 7 8 7s3.022-.289 4.096-.777C13.125 5.755 14 5.007 14 4s-.875-1.755-1.904-2.223C11.022 1.289 9.573 1 8 1Z"></path><path d="M2 7v-.839c.457.432 1.004.751 1.49.972C4.722 7.693 6.318 8 8 8s3.278-.307 4.51-.867c.486-.22 1.033-.54 1.49-.972V7c0 .424-.155.802-.411 1.133a4.51 4.51 0 0 0-4.815 1.843A12.31 12.31 0 0 1 8 10c-1.573 0-3.022-.289-4.096-.777C2.875 8.755 2 8.007 2 7Zm6.257 3.998L8 11c-1.682 0-3.278-.307-4.51-.867-.486-.22-1.033-.54-1.49-.972V10c0 1.007.875 1.755 1.904 2.223C4.978 12.711 6.427 13 8 13h.027a4.552 4.552 0 0 1 .23-2.002Zm-.002 3L8 14c-1.682 0-3.278-.307-4.51-.867-.486-.22-1.033-.54-1.49-.972V13c0 1.007.875 1.755 1.904 2.223C4.978 15.711 6.427 16 8 16c.536 0 1.058-.034 1.555-.097a4.507 4.507 0 0 1-1.3-1.905Z"></path><path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-.646-4.854.646.647.646-.647a.5.5 0 0 1 .708.708l-.647.646.647.646a.5.5 0 0 1-.708.708l-.646-.647-.646.647a.5.5 0 0 1-.708-.708l.647-.646-.647-.646a.5.5 0 0 1 .708-.708Z"></path></svg>
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