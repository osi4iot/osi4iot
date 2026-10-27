import { Component, ReactNode } from "react";
import styled from "styled-components";

const ErrorContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: white;
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

const isWebGLError = (error: Error) => /webgl|context/i.test(`${error?.message ?? ""}`);

class WebGLErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error("Digital twin viewer error:", error);
    }

    render() {
        const { error } = this.state;
        if (error) {
            return (
                <ErrorContainer>
                    <div>
                        {isWebGLError(error)
                            ? "It can not initialize the 3D viewer. Please reload the page."
                            : "The digital twin viewer has stopped because of an error."}
                    </div>
                    <ErrorDetail>{error.message}</ErrorDetail>
                    <RetryButton onClick={() => this.setState({ error: null })}>Retry</RetryButton>
                </ErrorContainer>
            );
        }
        return this.props.children;
    }
}

export default WebGLErrorBoundary;
