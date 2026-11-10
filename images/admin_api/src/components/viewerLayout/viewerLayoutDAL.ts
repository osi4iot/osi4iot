// The layout of the Viewer page of each digital twin (grafanadb.viewer_layout): one row per twin, saved by a
// group administrator for the whole group. Deleted with the twin or the group (ON DELETE CASCADE).
import pool, { readQuery } from "../../config/dbconfig";
import { IViewerLayout } from "./viewerLayoutValidation";

export interface IViewerLayoutRow {
	layout: IViewerLayout;
	updatedBy: string;
	updatedAt: string;
}

export const VIEWER_LAYOUT_DDL = `
CREATE TABLE IF NOT EXISTS grafanadb.viewer_layout(
	digital_twin_id bigint PRIMARY KEY,
	group_id bigint NOT NULL,
	layout jsonb NOT NULL,
	updated_by VARCHAR(255) NOT NULL DEFAULT '',
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_viewer_layout_digital_twin
		FOREIGN KEY(digital_twin_id)
		REFERENCES grafanadb.digital_twin(id)
		ON DELETE CASCADE,
	CONSTRAINT fk_viewer_layout_group
		FOREIGN KEY(group_id)
		REFERENCES grafanadb.group(id)
		ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_viewer_layout_group ON grafanadb.viewer_layout(group_id);`;

// Every replica at start, before serving (IF NOT EXISTS: new platforms and older versions)
export const ensureViewerLayoutTable = async (): Promise<void> => {
	await pool.query(VIEWER_LAYOUT_DDL);
};

export const getViewerLayout = async (groupId: number, digitalTwinId: number): Promise<IViewerLayoutRow | null> => {
	const result = await readQuery<IViewerLayoutRow>(
		`SELECT layout, updated_by AS "updatedBy", updated_at AS "updatedAt"
		FROM grafanadb.viewer_layout WHERE digital_twin_id = $1 AND group_id = $2`,
		[digitalTwinId, groupId]
	);
	return result.rows[0] ?? null;
};

export const saveViewerLayout = async (
	groupId: number,
	digitalTwinId: number,
	layout: IViewerLayout,
	updatedBy: string
): Promise<IViewerLayoutRow> => {
	const result = await pool.query<IViewerLayoutRow>(
		`INSERT INTO grafanadb.viewer_layout (digital_twin_id, group_id, layout, updated_by, updated_at)
		VALUES ($1, $2, $3::jsonb, $4, NOW())
		ON CONFLICT (digital_twin_id) DO UPDATE
		SET group_id = EXCLUDED.group_id, layout = EXCLUDED.layout, updated_by = EXCLUDED.updated_by, updated_at = NOW()
		RETURNING layout, updated_by AS "updatedBy", updated_at AS "updatedAt"`,
		[digitalTwinId, groupId, JSON.stringify(layout), updatedBy.slice(0, 255)]
	);
	return result.rows[0];
};

export const deleteViewerLayout = async (groupId: number, digitalTwinId: number): Promise<boolean> => {
	const result = await pool.query("DELETE FROM grafanadb.viewer_layout WHERE digital_twin_id = $1 AND group_id = $2", [
		digitalTwinId,
		groupId,
	]);
	return (result.rowCount ?? 0) > 0;
};
