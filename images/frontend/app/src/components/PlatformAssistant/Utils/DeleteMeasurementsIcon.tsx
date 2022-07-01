import { FC, SyntheticEvent, useState } from "react";
import { toast } from 'react-toastify';
import { FaTrash } from "react-icons/fa";
import styled from "styled-components";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { axiosAuth, axiosInstance, getDomainName, getProtocol } from "../../../tools/tools";
import { ITopic } from "../TableColumns/topicsColumns";
import DeleteModalWithDatePicker from "../../Tools/DeleteModalWithDatePicker";

const domainName = getDomainName();
const protocol = getProtocol();

const FaTrashStyled = styled(FaTrash)`
    font-size: 20px;
    color: white;
    background-color: #202226;
 `;



const IconContainer = styled.div`
    margin-left: 10px;
	display: flex;
	justify-content: center;
	align-items: center;

    &:hover {
        cursor: pointer;

		& ${FaTrashStyled} {
			color: #e02f44;
		}
    }
`;

interface DeleteMeasurementsIconProps {
    measurementTopic: string;
    selectedTopic: ITopic;
    refreshMeasurements: () => void;
}

const DeleteMeasurementsIcon: FC<DeleteMeasurementsIconProps> = ({ measurementTopic, selectedTopic, refreshMeasurements }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE MEASUREMENTS";
    const consequences = "All measurements in this topic prior to the chosen date are going to be lost.";
    const question = "Choose a date from which the measurements will be deleted:";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const groupId = selectedTopic.groupId;
    const width = 380;
    const height = 560;
    const [selectedDate, setSelectedDate] = useState(new Date());

    const changeSelectedDate = (selectedDate: Date) => {
        setSelectedDate(selectedDate);
    }

    const showLoader = () => {
        setIsSubmitting(true);
    }

    const action = (hideModal: () => void, selectedDate: Date) => {
        const deleteDate = selectedDate.toISOString();

        const payload = {
            deleteDate,
            topic: measurementTopic
        }
        const url = `${protocol}://${domainName}/admin_api/measurements_before_date/${groupId}`;
        const config: { headers: { Authorization: string } } = axiosAuth(accessToken);
        const headers = config.headers;
        axiosInstance(refreshToken, authDispatch)
            .delete(url, { data: payload, headers })
            .then((response) => {
                setIsSubmitting(false);
                refreshMeasurements();
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if(errorMessage !== "jwt expired") toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] =
        DeleteModalWithDatePicker(
            title,
            question,
            consequences,
            action,
            isSubmitting,
            showLoader,
            selectedDate,
            changeSelectedDate,
            width,
            height
        );

    const handleClick = (e: SyntheticEvent) => {
        setSelectedDate(new Date());
        showModal();
    };

    return (
        <IconContainer onClick={handleClick} >
            <FaTrashStyled />
        </IconContainer>
    );
};

export default DeleteMeasurementsIcon;
