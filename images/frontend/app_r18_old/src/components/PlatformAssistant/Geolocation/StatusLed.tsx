import styled from "styled-components";
import { STATUS_OK, STATUS_PENDING, STATUS_ALERTING } from "./statusTools";

interface StatusLedProps {
	readonly status: string;
	readonly size: string;
}

export const StatusLed = styled.span.withConfig({
	shouldForwardProp: (prop) => prop !== 'status' && prop !== 'size'
  })<StatusLedProps>`
	background-color: ${(props) => {
		if (props.status === "ok") return STATUS_OK;
		else if (props.status === "pending") return STATUS_PENDING;
		else if (props.status === "alerting") return STATUS_ALERTING;
	}};
	width: ${(props) => props.size};
	height: ${(props) => props.size};
	margin: 1px 5px;
	border-radius: 50%;
	display: inline-block;
}
`;