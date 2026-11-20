// Deleting a sensor, topic, asset or digital twin whose topics have stored measurements needs a confirmation
// (README, "Permissions"): admin_api answers 409 with how many would be left without a sensor to name them. The
// user is asked, and the deletion is sent again with ?confirmDataLoss=true; if the user does not confirm, the answer
// is an error that says nothing was deleted.
import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

const withConfirmation = (url: string) => `${url}${url.includes("?") ? "&" : "?"}confirmDataLoss=true`;

export const deleteConfirmingDataLoss = async (
    axiosInstance: AxiosInstance,
    url: string,
    config: AxiosRequestConfig,
    confirm: (message: string) => boolean = (message) => window.confirm(message),
): Promise<AxiosResponse> => {
    try {
        return await axiosInstance.delete(url, config);
    } catch (error) {
        const answer = (error as AxiosError)?.response;
        if (answer?.status !== 409) throw error;
        const message = (answer.data as { message?: string } | undefined)?.message ?? "It has stored measurements.";
        if (confirm(message)) return axiosInstance.delete(withConfirmation(url), config);
        const kept = new AxiosError("Not deleted", "CANCELLED", undefined, undefined, {
            ...answer,
            data: { message: "Not deleted: the stored measurements are kept." },
        });
        throw kept;
    }
};
