import { FC } from "react";
import { ChildrenProp } from "../../interfaces/interfaces";
import styled from "styled-components";

const Error = styled.div`
    font-size: 12px;
    color: red;
`;

const TextError: FC<ChildrenProp> = ({ children }) => {
	return (
        <Error>
            {children}
		</Error>
	);
};

export default TextError;