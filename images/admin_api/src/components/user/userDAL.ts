import pool from "../../config/dbconfig";
import { logger as winston } from "../../config/winston";
import { QueryResult } from 'pg';

export const getUserLoginDatadByEmailOrLogin = async (emailOrLogin: string) => {
    const response: QueryResult = await
        pool.query('SELECT id, login, email, password, salt FROM grafanadb.user WHERE email = $1 OR login = $2', [emailOrLogin, emailOrLogin]);
    return response.rows[0];
};

export const getUserdById = async (id: number) => {
    const response: QueryResult = await
        pool.query('SELECT id, login, email, is_admin FROM grafanadb.user WHERE id = $1', [id]);
    return response.rows[0];
};