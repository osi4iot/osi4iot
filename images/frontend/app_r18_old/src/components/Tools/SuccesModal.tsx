import React, { FC } from "react";
import styled from "styled-components";

const SuccessModalContainer = styled.div`
	font-size: 14px;
	font-weight: 500;
	padding: 10px 20px;
	color: #FFFFFF;
	background: #60A917;
	border-radius: 2px;
	width: 250px;
`;

interface SuccessModalProp {
	children: string;
}

const SuccessModal: FC<SuccessModalProp> = ({ children }) => {
	return <SuccessModalContainer>{children}</SuccessModalContainer>;
};

export default SuccessModal;