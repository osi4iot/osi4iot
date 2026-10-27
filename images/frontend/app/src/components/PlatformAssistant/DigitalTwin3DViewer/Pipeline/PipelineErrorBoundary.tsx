import { Component, ReactNode } from "react";
import styled from "styled-components";

// Un error en el editor de pipelines no debe tumbar todo el visor (antes aparecía el mensaje
// "It can not initialize the 3D viewer").
const ErrorContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: white;
    background-color: #212121;
    font-size: 14px;
    padding: 20px;
    text-align: center;
`;

const ErrorDetail = styled.code`
    color: #ff8080;
    font-size: 12px;
    max-width: 90%;
    word-break: break-word;
`;

const RetryButton = styled.button`
    background-color: #3274d9;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    cursor: pointer;

    &:hover {
        background-color: #2461c0;
    }
`;

interface Props {
    children: ReactNode;
    resetKey?: string;
}

interface State {
    error: Error | null;
    resetKey?: string;
}

class PipelineErrorBoundary extends Component<Props, State> {
    state: State = { error: null, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    static getDerivedStateFromProps(props: Props, state: State) {
        if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
        return null;
    }

    componentDidCatch(error: Error) {
        console.error("Pipeline editor error:", error);
    }

    render() {
        if (this.state.error) {
            return (
                <ErrorContainer>
                    <div>The pipeline editor has stopped because of an error.</div>
                    <ErrorDetail>{this.state.error.message}</ErrorDetail>
                    <RetryButton onClick={() => this.setState({ error: null })}>Retry</RetryButton>
                </ErrorContainer>
            );
        }
        return this.props.children;
    }
}

export default PipelineErrorBoundary;
