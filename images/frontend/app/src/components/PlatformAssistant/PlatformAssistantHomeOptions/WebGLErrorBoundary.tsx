import { Component, ReactNode } from "react";

class WebGLErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.error("WebGL Error captured:", error);
    }

    render() {
        if (this.state.hasError) {
            return <div>It can not initialize the 3D viewer. Please reload the page.</div>;
        }
        return this.props.children;
    }
}

export default WebGLErrorBoundary;