import crypto from "crypto";
import pool, { readQuery } from "../../config/dbconfig";

// Link between a platform user and its Telegram account. Telegram says who
// pressed a button (its user id), but not who that is in the platform: the
// user asks here for a one-time code and sends it to its organization's bot
// as "/link <code>"; pipelines, which reads the bot, confirms it with
// linkTelegramUser. Approval nodes then take Telegram decisions only from
// linked users who administer the group (getTelegramApprover).

const LINK_CODE_LIFETIME_MINUTES = 10;
// Without 0/O and 1/I/L, so that a code read from the screen is typed right
const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LINK_CODE_LENGTH = 8;

export interface ITelegramLinkCode {
	code: string;
	expiresAt: string;
}

export interface ITelegramLink {
	telegramLinked: boolean;
	telegramUsername: string;
}

const newLinkCode = (): string => {
	const bytes = crypto.randomBytes(LINK_CODE_LENGTH);
	let code = "";
	for (const byte of bytes) code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
	return code;
};

// A new code for the user (its previous ones stop working).
export const createTelegramLinkCode = async (userId: number): Promise<ITelegramLinkCode> => {
	await pool.query("DELETE FROM grafanadb.telegram_link_code WHERE user_id = $1 OR expires_at < NOW()", [userId]);
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = newLinkCode();
		const result = await pool.query<{ code: string; expiresAt: Date }>(
			`INSERT INTO grafanadb.telegram_link_code (code, user_id, expires_at)
			VALUES ($1, $2, NOW() + make_interval(mins => $3))
			ON CONFLICT (code) DO NOTHING
			RETURNING code, expires_at AS "expiresAt"`,
			[code, userId, LINK_CODE_LIFETIME_MINUTES]
		);
		if (result.rows.length !== 0) {
			return { code: result.rows[0].code, expiresAt: new Date(result.rows[0].expiresAt).toISOString() };
		}
	}
	throw new Error("A Telegram link code could not be created");
};

// Links the Telegram account to the user of a valid code (once: the code is
// spent). A Telegram account is linked to one user only. Returns the user's
// login, or null for an unknown or expired code.
export const linkTelegramUser = async (
	code: string,
	telegramUserId: number,
	telegramUsername: string
): Promise<string | null> => {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const spent = await client.query<{ user_id: number }>(
			"DELETE FROM grafanadb.telegram_link_code WHERE code = $1 AND expires_at > NOW() RETURNING user_id",
			[code.trim().toUpperCase()]
		);
		if (spent.rows.length === 0) {
			await client.query("ROLLBACK");
			return null;
		}
		const userId = spent.rows[0].user_id;
		await client.query(
			"UPDATE grafanadb.user SET telegram_user_id = NULL, telegram_username = '' WHERE telegram_user_id = $1 AND id <> $2",
			[telegramUserId, userId]
		);
		const updated = await client.query<{ login: string }>(
			"UPDATE grafanadb.user SET telegram_user_id = $1, telegram_username = $2 WHERE id = $3 RETURNING login",
			[telegramUserId, telegramUsername.slice(0, 64), userId]
		);
		await client.query("COMMIT");
		return updated.rows.length !== 0 ? updated.rows[0].login : null;
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
	}
};

export const unlinkTelegramUser = async (userId: number): Promise<void> => {
	await pool.query("UPDATE grafanadb.user SET telegram_user_id = NULL, telegram_username = '' WHERE id = $1", [userId]);
	await pool.query("DELETE FROM grafanadb.telegram_link_code WHERE user_id = $1", [userId]);
};

export const getTelegramLink = async (userId: number): Promise<ITelegramLink> => {
	const result = await readQuery<ITelegramLink>(
		`SELECT telegram_user_id IS NOT NULL AS "telegramLinked", telegram_username AS "telegramUsername"
		FROM grafanadb.user WHERE id = $1`,
		[userId]
	);
	if (result.rows.length === 0) return { telegramLinked: false, telegramUsername: "" };
	return result.rows[0];
};

// The login of the enabled user linked to the Telegram account when it
// administers the group: group administrator (team permission 4, as for its
// NATS permissions in auth_callout), administrator of the group's
// organization, or platform administrator. null otherwise.
export const getTelegramApprover = async (groupId: number, telegramUserId: number): Promise<string | null> => {
	const result = await readQuery<{ login: string }>(
		`SELECT u.login FROM grafanadb.user u, grafanadb.group g
		WHERE u.telegram_user_id = $1 AND g.id = $2 AND NOT u.is_disabled AND (
			u.is_admin
			OR EXISTS (SELECT 1 FROM grafanadb.team_member tm
				WHERE tm.team_id = g.team_id AND tm.user_id = u.id AND tm.permission = 4)
			OR EXISTS (SELECT 1 FROM grafanadb.org_user ou
				WHERE ou.org_id = g.org_id AND ou.user_id = u.id AND ou.role = 'Admin')
		)`,
		[telegramUserId, groupId]
	);
	return result.rows.length !== 0 ? result.rows[0].login : null;
};