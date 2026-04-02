import { useFormikContext } from "formik";
import { FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";

const FormContainerDiv = styled.div<{ width: number }>`
    font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: ${({ width }) => width}px;
    min-width: 400px;
    height: calc(100vh - 310px);
    position: relative;

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ResizeHandle = styled.div`
    position: absolute;
    top: 0;
    right: -14px;
    width: 10px;
    height: 100%;
    cursor: ew-resize;
    z-index: 10;

    &::after {
        content: '';
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        height: 100px;
        width: 2px;
        background: #3274d9;
        opacity: 0.4;
        transition: opacity 0.2s;
        border-radius: 2px;
    }

    &:hover::after {
        opacity: 1;
    }
`;

export const DraggableFormContainer: FC<{ children: React.ReactNode }> = ({ children }) => {
    const [width, setWidth] = useState(400);

    const onMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = width;

        const onMouseMove = (e: MouseEvent) => {
            const newWidth = Math.max(400, startWidth + (e.clientX - startX));
            setWidth(newWidth);
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    return (
        <FormContainerDiv width={width}>
            <ResizeHandle onMouseDown={onMouseDown} />
            {children}
        </FormContainerDiv>
    );
};

export const ErrorMessage = styled.div`
    color: #f87171;
    font-size: 12px;
    margin-top: 4px;
    margin-left: 3px;
`;

interface FieldErrorScrollerProps {
    name: string;
}

export const FieldErrorScroller: FC<FieldErrorScrollerProps> = ({ name }) => {
    const formik = useFormikContext<any>();
    const errorRef = useRef<HTMLDivElement>(null);

    const error = formik.errors[name] as string | undefined;
    const touched = formik.touched[name] as boolean | undefined;

    useEffect(() => {
        if (error && touched && errorRef.current) {
            errorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [error, touched]);

    if (!touched || !error) return null;

    return (
        <div ref={errorRef}>
            <ErrorMessage>{error}</ErrorMessage>
        </div>
    );
};

export const StaticFormContainer = styled.div`
	font-size: 12px;
    padding: 30px 10px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 310px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

export const ControlsContainer = styled.div`
    height: calc(100vh - 440px);
    width: 100%;
    padding: 0px 5px;
    overflow-y: auto;
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

    div:nth-child(3) {
        margin-bottom: 10px;
    }

    div:last-child {
        margin-bottom: 3px;
    }
`;