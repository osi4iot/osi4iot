import pool from "../../config/dbconfig";
import IRefreshToken from "./refreshToken.interface";

export const insertRefreshToken = async (userId: number, refreshToken: string): Promise<void> => {
	const result = await pool.query(`INSERT INTO grafanadb.refresh_token (user_id, token, created, updated)
					VALUES ($1, $2, NOW(), NOW())`,
		[
			userId,
			refreshToken
		]);
};

export const exitsRefreshToken = async (refreshToken: string): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.refresh_token WHERE token = $1',
		[refreshToken]);
	return result.rows[0].count !== "0";
};

export const deleteRefreshToken = async (refreshToken: string): Promise<string> => {
	const result = await pool.query(`DELETE FROM grafanadb.refresh_token WHERE token = $1
							RETURNING *`,
		[refreshToken]);
	const deletedRefreshToken = result.rows[0];
	if (deletedRefreshToken) return "Refresh token disabled successfully";
	else return "The indicated refresh token not exists";
};

export const deleteUserRefreshTokens = async (userId: number): Promise<string> => {
	const result = await pool.query(`DELETE FROM grafanadb.refresh_token WHERE user_id = $1
							RETURNING *`,
		[userId]);
	if (result.rows.length !== 0) return "User refresh tokens are been disabled successfully";
	else return "None user refresh tokens are been disabled";
};

export const updateRefreshToken = async (oldRefreshToken: string, newRefreshToken: string): Promise<void> => {
	const result = await pool.query('UPDATE grafanadb.refresh_token SET token = $1, updated = NOW() WHERE token = $2 RETURNING *',
		[newRefreshToken, oldRefreshToken]);
};

export const getRefreshTokenByUserId = async (userId: number): Promise<IRefreshToken> => {
	const result = await pool.query(`SELECT id, user_id AS "userId", token,
									created, AGE(NOW(), created) AS "createdAtAge",
									updated, AGE(NOW(), updated) AS "updatedAtAge"
							 		FROM grafanadb.refresh_token WHERE user_id = $1`, [userId]);
	return result.rows[0];
};

export const getAllRefreshTokens = async (): Promise<IRefreshToken[]> => {
	const result = await pool.query(`SELECT id, user_id AS "userId", token,
									created, AGE(NOW(), created) AS "createdAtAge",
									updated, AGE(NOW(), updated) AS "updatedAtAge"
	 								FROM grafanadb.refresh_token
									ORDER BY id ASC, user_id ASC`);
	return result.rows;
}


