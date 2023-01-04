import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { FLOORS_OPTIONS } from '../Utils/platformAssistantOptions';
import { IFloor } from '../TableColumns/floorsColumns';
import {
    useFloorIdToEdit,
    useFloorRowIndexToEdit,
    useFloorsDispatch,
    setFloorsOptionToShow
} from '../../../contexts/floorsOptions';
import geojsonValidation from '../../../tools/geojsonValidation';


const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 420px);
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
`;

const FloorLocationTitle = styled.div`
    margin-bottom: 5px;
`;

const FloorLocationContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
`;

const SelectFloorLocationButtonContainer = styled.div`
    display: flex;
    margin-bottom: 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const SelectFileButton = styled.button`
	background-color: #3274d9;
	padding: 5px 10px;
    margin: 5px 10px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;
    width: 80%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();

interface EditFloorProps {
    floors: IFloor[];
    backToTable: () => void;
    refreshFloors: () => void;
}

const EditFloor: FC<EditFloorProps> = ({ floors, backToTable, refreshFloors }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const floorsDispatch = useFloorsDispatch();
    const floorId = useFloorIdToEdit();
    const floorRowIndex = useFloorRowIndexToEdit();
    const [localFileContent, setLocalFileContent] = useState("");
    const [localFileLoaded, setLocalFileLoaded] = useState(false);
    const [localFileLabel, setLocalFileLabel] = useState("Select local file");

    const [openFileSelector, { filesContent, plainFiles, loading, clear }] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.geojson',
    });

    useEffect(() => {
        if (!loading && filesContent.length !== 0 && plainFiles.length !== 0) {
            setLocalFileContent(filesContent[0].content);
            setLocalFileLoaded(true)
            setLocalFileLabel(`Add geodata from ${plainFiles[0].name} file`);
        }
    }, [loading, filesContent, plainFiles])


    const onSubmit = (values: any, actions: any) => {
        const url = `${protocol}://${domainName}/admin_api/building_floor/${floorId}`;
        const config = axiosAuth(accessToken);

        setIsSubmitting(true);

        if (typeof (values as any).buildingId === 'string') {
            (values as any).buildingId = parseInt((values as any).buildingId, 10);
        }

        if (typeof (values as any).floorNumber === 'string') {
            (values as any).floorNumber = parseInt((values as any).floorNumber, 10);
        }

        values.geoJsonData = JSON.stringify(JSON.parse(values.geoJsonData));

        axiosInstance(refreshToken, authDispatch)
            .patch(url, values, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const floorsOptionToShow = { floorsOptionToShow: FLOORS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setFloorsOptionToShow(floorsDispatch, floorsOptionToShow);
                refreshFloors();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if(errorMessage !== "jwt expired") toast.error(errorMessage);
                backToTable();
            })
    }

    const initialDeviceData = {
        buildingId: floors[floorRowIndex].buildingId,
        floorNumber: floors[floorRowIndex].floorNumber,
        geoJsonData: JSON.stringify(floors[floorRowIndex].geoJsonData, null, 4)
    }

    const validationSchema = Yup.object().shape({
        buildingId: Yup.number().integer().positive().required('Required'),
        floorNumber: Yup.number().integer().required('Required'),
        geoJsonData: Yup.string().test(`test-geojson`, '', geojsonValidation).required('Required'),
    });

    const resetFileSelect = (e: SyntheticEvent) => {
        e.preventDefault();
        setLocalFileLabel("Select local file");
        setLocalFileContent("");
        setLocalFileLoaded(false);
        clear();
    }

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting} >Edit floor</FormTitle>
            <FormContainer>
                <Formik initialValues={initialDeviceData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            const localFileButtonHandler = () => {
                                if (!localFileLoaded) {
                                    selectFile(openFileSelector, clear);
                                } else {
                                    try {
                                        const values = { ...formik.values };
                                        const geojsonObj = JSON.parse(localFileContent);
                                        values.geoJsonData = JSON.stringify(geojsonObj, null, 4);
                                        formik.setValues(values);
                                    } catch (e) {
                                        console.log(e);
                                        toast.error("Invalid geojson file");
                                        setLocalFileLabel("Select local file");
                                        setLocalFileContent("");
                                        setLocalFileLoaded(false);
                                        clear();
                                    }
                                }
                            }
                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='input'
                                            label='Building Id'
                                            name='buildingId'
                                            type='text'
                                        />
                                        <FloorLocationTitle>Floor location</FloorLocationTitle>
                                        <FloorLocationContainer>
                                            <FormikControl
                                                control='input'
                                                label='Floor number'
                                                name='floorNumber'
                                                type='text'
                                            />
                                            <FormikControl
                                                control='textarea'
                                                label='Geojson data'
                                                name='geoJsonData'
                                                textAreaSize='Large'
                                            />
                                            <SelectFloorLocationButtonContainer >
                                                <SelectFileButton
                                                    type='button'
                                                    onClick={() => localFileButtonHandler()}
                                                    onContextMenu={resetFileSelect}
                                                >
                                                    {localFileLabel}
                                                </SelectFileButton>
                                            </SelectFloorLocationButtonContainer>
                                        </FloorLocationContainer>
                                    </ControlsContainer>
                                    <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                                </Form>
                            )
                        }
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default EditFloor;