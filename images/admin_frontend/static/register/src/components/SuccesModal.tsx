import React, { FC } from "react";
import styled from "styled-components";

const SuccessModalContainer = styled.div`
	font-size: 14px;
	font-weight: 500;
	padding: 10px 20px;
	color: rgb(255, 255, 255);
	background: #03ac03;
	border-radius: 2px;
`;

interface SuccessModalProp {
	children: string;
}

const SuccessModal: FC<SuccessModalProp> = ({ children }) => {
	return <SuccessModalContainer>{children}</SuccessModalContainer>;
};

export default SuccessModal;