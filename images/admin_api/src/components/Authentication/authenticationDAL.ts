import pool, { readQuery } from "../../config/dbconfig";
import IRefreshToken from "./refreshToken.interface";

export const insertRefreshToken = async (userId: number, refreshToken: string): Promise<void> => {
	await pool.query(`INSERT INTO grafanadb.refresh_token (user_id, token, created, updated)
					VALUES ($1, $2, NOW(), NOW())`,
	[
		userId,
		refreshToken
	]);
};

// One refresh token per user (one session per identity). When it is renewed (near its expiry), the one it
// replaces stays valid (previous_token) until its own expiry, which the JWT strategy checks: the other
// devices of the user that still have it are not logged out, they get the new one on their next renewal.
export const ensureRefreshTokenPreviousColumn = async (): Promise<void> => {
	await pool.query("ALTER TABLE grafanadb.refresh_token ADD COLUMN IF NOT EXISTS previous_token TEXT");
	await pool.query(
		"CREATE INDEX IF NOT EXISTS idx_refresh_token_previous ON grafanadb.refresh_token(previous_token)"
	);
};

// the user's refresh token, or the one it replaced
export const exitsRefreshToken = async (refreshToken: string): Promise<boolean> => {
	const result = await readQuery(
		"SELECT COUNT(*) FROM grafanadb.refresh_token WHERE token = $1 OR previous_token = $1",
		[refreshToken]
	);
	return Number(result.rows[0].count) !== 0;
};

export const deleteRefreshToken = async (refreshToken: string): Promise<string> => {
	const result = await pool.query(`DELETE FROM grafanadb.refresh_token WHERE token = $1 OR previous_token = $1
							RETURNING *`,
	[refreshToken]);
	const deletedRefreshToken = result.rows[0];
	if (deletedRefreshToken) return "Refresh token disabled successfully";
	else return "The indicated refresh token not exists";
};

export const deleteRefreshTokenById = async (refreshTokenId: number): Promise<string> => {
	const result = await pool.query(`DELETE FROM grafanadb.refresh_token WHERE id = $1
							RETURNING *`,
	[refreshTokenId]);
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

// the new refresh token; the old one is kept as previous_token (see ensureRefreshTokenPreviousColumn)
// false when another request renewed it first (the old one is no longer the current one)
export const updateRefreshToken = async (oldRefreshToken: string, newRefreshToken: string): Promise<boolean> => {
	const result = await pool.query(
		"UPDATE grafanadb.refresh_token SET previous_token = token, token = $1, updated = NOW() WHERE token = $2 RETURNING *",
		[newRefreshToken, oldRefreshToken]
	);
	return result.rows.length !== 0;
};

export const getRefreshTokenByUserId = async (userId: number): Promise<IRefreshToken> => {
	const result = await readQuery(`SELECT id, user_id AS "userId", token,
									AGE(NOW(), created) AS "createdAtAge",
									AGE(NOW(), updated) AS "updatedAtAge"
							 		FROM grafanadb.refresh_token WHERE user_id = $1`, [userId]);
	return result.rows[0] as IRefreshToken;
};

export const getAllRefreshTokens = async (): Promise<IRefreshToken[]> => {
	const result = await readQuery(`SELECT id, user_id AS "userId", token,
									AGE(NOW(), created) AS "createdAtAge",
									AGE(NOW(), updated) AS "updatedAtAge"
	 								FROM grafanadb.refresh_token
									ORDER BY id ASC, user_id ASC`);
	return result.rows as IRefreshToken[];
}