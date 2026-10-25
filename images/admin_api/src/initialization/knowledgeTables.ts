import { PoolClient } from "pg";
import { logger } from "../config/winston";

// Knowledge bases (RAG): what admin_api keeps of them
//
//   grafanadb.group.rag_enabled, grafanadb.org.rag_enabled
//       the knowledge base is off unless enabled for the organization
//       (platform administrator) and for the group (organization
//       administrator), like the GPU usage;
//   grafanadb.knowledge_document
//       one row per document of a group's knowledge base, with its title
//       (optional: '' shows the file name);
//   grafanadb.digital_twin_knowledge_document
//       the documents each digital twin's AI agents may read: none unless
//       chosen. Deleting the document or the digital twin deletes the rows.
//
// pipelines reads the last two (role pipelines_rag, SELECT only) to give
// each agent the titles of its documents and to search only in them.
//
// Run on every start of replica 1: everything is IF NOT EXISTS, so it
// brings older platforms up to date and is a no-op afterwards. The
// pipelines_rag role exists only when the CLI created the rag schema;
// without it there is nothing to grant.

const queryKnowledgeTables = `
ALTER TABLE grafanadb.group ADD COLUMN IF NOT EXISTS rag_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS grafanadb.knowledge_document(
	group_id bigint NOT NULL,
	file_name VARCHAR(200) NOT NULL,
	title VARCHAR(200) NOT NULL DEFAULT '',
	created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (group_id, file_name),
	CONSTRAINT fk_group_id
		FOREIGN KEY(group_id)
			REFERENCES grafanadb.group(id)
			ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grafanadb.digital_twin_knowledge_document(
	digital_twin_id bigint NOT NULL,
	group_id bigint NOT NULL,
	file_name VARCHAR(200) NOT NULL,
	PRIMARY KEY (digital_twin_id, file_name),
	CONSTRAINT fk_digital_twin_id
		FOREIGN KEY(digital_twin_id)
			REFERENCES grafanadb.digital_twin(id)
			ON DELETE CASCADE,
	CONSTRAINT fk_knowledge_document
		FOREIGN KEY(group_id, file_name)
			REFERENCES grafanadb.knowledge_document(group_id, file_name)
			ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digital_twin_knowledge_document_file
ON grafanadb.digital_twin_knowledge_document(group_id, file_name);

DO $$
BEGIN
	IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'pipelines_rag') THEN
		GRANT USAGE ON SCHEMA grafanadb TO pipelines_rag;
		GRANT SELECT ON grafanadb.knowledge_document, grafanadb.digital_twin_knowledge_document TO pipelines_rag;
	END IF;
END
$$;`;

export const ensureKnowledgeTables = async (client: PoolClient): Promise<void> => {
	try {
		await client.query(queryKnowledgeTables);
		logger.log("info", "Knowledge base tables are up to date");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `Knowledge base tables could not be created: %s`, message);
	}
};
