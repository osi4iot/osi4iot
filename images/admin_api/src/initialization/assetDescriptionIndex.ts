import { PoolClient } from "pg";
import { logger } from "../config/winston";

// An asset is chosen by its description (Asset_<uid> says nothing about
// it), so two assets of a group cannot have the same description: the
// same text, ignoring case and the spaces around it. admin_api checks it
// when an asset is created or edited (asset.controller.ts); this index
// makes sure of it.
//
// Run on every start of replica 1. On a platform whose groups already
// have assets with the same description the index cannot be created: the
// log names them, and it is created on a later start once they have been
// renamed.

const queryAssetDescriptionIndex = `
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_group_description
ON grafanadb.asset (group_id, lower(btrim(description)));`;

const queryDuplicates = `
SELECT group_id, lower(btrim(description)) AS description, string_agg(asset_uid, ', ') AS assets
FROM grafanadb.asset
GROUP BY group_id, lower(btrim(description))
HAVING count(*) > 1
ORDER BY group_id;`;

export const ensureAssetDescriptionIndex = async (client: PoolClient): Promise<void> => {
	try {
		await client.query(queryAssetDescriptionIndex);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		let duplicates = "";
		try {
			const result = await client.query<{ group_id: number; description: string; assets: string }>(
				queryDuplicates
			);
			duplicates = result.rows
				.map((row) => `group ${row.group_id}: "${row.description}" (Asset_${row.assets.split(", ").join(", Asset_")})`)
				.join("; ");
		} catch {
			// only for the message
		}
		logger.log(
			"error",
			`The unique index of the assets' descriptions per group could not be created: %s${
				duplicates ? `. Assets with the same description: ${duplicates}` : ""
			}`,
			message
		);
	}
};
