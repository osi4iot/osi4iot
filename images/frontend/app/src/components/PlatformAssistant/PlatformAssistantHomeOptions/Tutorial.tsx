import { FC, useEffect, useState, useRef, WheelEvent } from 'react';
import { useWindowHeight } from "@react-hook/window-size";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { ImFirst, ImPrevious2, ImNext2, ImLast } from "react-icons/im";
import { AiOutlineZoomOut, AiOutlineZoomIn } from "react-icons/ai";
import styled from "styled-components";
import PdfLoader from '../../Tools/PdfLoader';

const TutorialContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
`;

const PageContainer = styled.div`
    width: 100%;
    height: calc(100vh - 278px);
	background-color: #0c0d0f;
    margin-top: 25px;
    margin-bottom: 8px;

	overflow: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
		height: 10px;
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

	::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }
`;

const PageControlsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    width: 230px;
    height= 50px;
    padding: 8px;
    background-color: #0c0d0f;
    border-radius: 15px;
`;

const FirstPageIcon = styled(ImFirst)`
	font-size: 20px;
	color: white;
    &:hover {
        cursor: pointer;
		color: #2461c0;
	}
`;

const PreviousPageIcon = styled(ImPrevious2)`
	font-size: 20px;
	color: white;
    &:hover {
        cursor: pointer;
		color: #2461c0;
	}
`;

const NextPageIcon = styled(ImNext2)`
	font-size: 20px;
	color: white;
    &:hover {
        cursor: pointer;
		color: #2461c0;
	}
`;

const LastPageIcon = styled(ImLast)`
	font-size: 20px;
	color: white;
    &:hover {
        cursor: pointer;
		color: #2461c0;
	}
`;

const ZoomInIcon = styled(AiOutlineZoomIn)`
	font-size: 20px;
	color: white;
    &:hover {
        cursor: pointer;
		color: #2461c0;
	}
`;

const Separator = styled.div`
    width: 5px;
    font-size: 18px;
    color: #62656b;
    -moz-user-select: none;
    -khtml-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;
`;

const ZoomOutIcon = styled(AiOutlineZoomOut)`
	font-size: 20px;
	color: white;
    &:hover {
        cursor: pointer;
		color: #2461c0;
	}
`;

const StyledDocument = styled(Document)`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
`;

const PageNumbersContainer = styled.div`
    -moz-user-select: none;
    -khtml-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;
`;


const Tutorial: FC<{}> = () => {
    const [numPages, setNumPages] = useState<null | number>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(0.78);
    const ref = useRef(null);
    const windowHeight = useWindowHeight();

    useEffect(() => {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;
    });

    const onDocumentLoadSuccess = ({ numPages }: { numPages: any }) => {
        setNumPages(numPages);
    }

    const onItemClickHandler = ({ pageNumber }: { pageNumber: string; }) => {
        setPageNumber(parseInt(pageNumber, 10))
    }

    const onWheelHandler = (e: WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        const rect = (ref.current as any)?.getBoundingClientRect();
        const bottomDist = windowHeight - rect.bottom;
        if (rect !== undefined) {
            if (numPages) {
                if (e.deltaY === 100 && bottomDist > 0.0 && bottomDist <= 63) {
                    const nextPageNumber = pageNumber === numPages ? numPages : pageNumber + 1;
                    setPageNumber(nextPageNumber);
                } else if (e.deltaY === -100 && rect.top === 218) {
                    const previousPageNumber = pageNumber === 1 ? 1 : pageNumber - 1;
                    setPageNumber(previousPageNumber);
                }
            }
        }
    }

    const firstPageHandler = () => {
        setPageNumber(1);
    }

    const previousPageHandler = () => {
        const previousPageNumber = pageNumber === 1 ? 1 : pageNumber - 1;
        setPageNumber(previousPageNumber);
    }

    const lastPageHandler = () => {
        setPageNumber(numPages as number);
    }

    const nextPageHandler = () => {
        const nextPageNumber = pageNumber === numPages ? numPages : pageNumber + 1;
        setPageNumber(nextPageNumber);
    }

    const zoomOutHandler = () => {
        const newScale = scale * 0.9 >= 0.8 ? scale * 0.9 : 0.8;
        setScale(newScale);
    }

    const zoomInHandler = () => {
        const newScale = scale * 1.1 <= 2.5 ? scale * 1.1 : 2.5;
        setScale(newScale);
    }

    return (
        <TutorialContainer>
            <StyledDocument
                file="OSI4IOT_Tutorial.pdf"
                onLoadSuccess={onDocumentLoadSuccess}
                onItemClick={onItemClickHandler}
                loading={<PdfLoader />}
            >
                <PageContainer onWheel={onWheelHandler}>
                    <Page pageNumber={pageNumber} scale={scale} canvasRef={ref} />
                </PageContainer>
                <PageControlsContainer>
                    < ZoomOutIcon onClick={zoomOutHandler} />
                    < ZoomInIcon onClick={zoomInHandler} />
                    <Separator>|</Separator>
                    <FirstPageIcon onClick={firstPageHandler} />
                    <PreviousPageIcon onClick={previousPageHandler} />
                    <PageNumbersContainer>
                        {pageNumber}/{numPages}
                    </PageNumbersContainer>
                    <NextPageIcon onClick={nextPageHandler} />
                    <LastPageIcon onClick={lastPageHandler} />
                </PageControlsContainer>
            </StyledDocument>
        </TutorialContainer>
    )
}

export default Tutorial;