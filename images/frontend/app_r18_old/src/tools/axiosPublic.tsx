import axios from "axios";

export const axiosPublic = axios.create({
    baseURL: '',
    // withCredentials: false,
    // headers: {
    //     'Access-Control-Allow-Origin': '*',
    //     'Access-Control-Allow-Methods': 'POST',
    // },
});