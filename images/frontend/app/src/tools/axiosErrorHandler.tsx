import { AxiosError } from "axios";
import { toast } from "react-toastify";
import { logout } from "../contexts/authContext";

const axiosErrorHandler = (error: AxiosError, authDispatch: any) => {
    if (error.response && error.response.data) {
        const { message } = error.response.data as {message: string};
        if (message === "jwt expired") logout(authDispatch);
        else toast.error(message);
    } else console.log(error);
}

export default axiosErrorHandler;