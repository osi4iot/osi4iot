import { PoolClient } from "pg";
import { logger } from "../config/winston";
import { isMessageSchemaEditable, FIXED_MESSAGE_SCHEMAS } from "../components/topic/messageSchema";

// Message schema of the topics (see components/topic/messageSchema.ts):
//  - grafanadb.topic.payload_json_schema is renamed to message_schema and gets message_schema_version.
//  - grafanadb.topic_message_schema keeps every version (SCD2: valid_from, valid_to, is_current), filled by triggers
//    of grafanadb.topic: a change of message_schema is a new version, except when it replaces the empty schema {}
//    (the first schema of a topic is still version 1).
//
// Run on every start of replica 1, for new and existing databases, right after grafanadb.topic is created: every
// step is idempotent.

const TOPIC_TYPES_NOT_EDITABLE = [
	"dev2pdb",
	"dev2pdb_wt",
	"dev2pdb_ma",
	"dev2sim",
	"sim2dtm",
	"dtm2sim",
	...Object.keys(FIXED_MESSAGE_SCHEMAS),
].filter((topicType) => !isMessageSchemaEditable(topicType));

const columnExists = (column: string) => `EXISTS (SELECT 1 FROM information_schema.columns
	WHERE table_schema = 'grafanadb' AND table_name = 'topic' AND column_name = '${column}')`;

const queryColumns = `
DO $$
BEGIN
	IF ${columnExists("payload_json_schema")} AND NOT ${columnExists("message_schema")} THEN
		ALTER TABLE grafanadb.topic RENAME COLUMN payload_json_schema TO message_schema;
		-- the platform computes these again on start, from version 1
		UPDATE grafanadb.topic SET message_schema = '{}'::jsonb
			WHERE topic_type = ANY(ARRAY[${TOPIC_TYPES_NOT_EDITABLE.map((type) => `'${type}'`).join(", ")}]);
	END IF;
END $$;

ALTER TABLE grafanadb.topic
	ADD COLUMN IF NOT EXISTS message_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
	ADD COLUMN IF NOT EXISTS message_schema_version integer NOT NULL DEFAULT 1;

-- schemas stored as a JSON string (some clients encoded them twice): to an object, {} if they are not one
DO $$
DECLARE
	r record;
	v jsonb;
BEGIN
	FOR r IN SELECT id, message_schema FROM grafanadb.topic WHERE jsonb_typeof(message_schema) <> 'object' LOOP
		BEGIN
			v := (r.message_schema #>> '{}')::jsonb;
			IF jsonb_typeof(v) = 'string' THEN
				v := (v #>> '{}')::jsonb;
			END IF;
		EXCEPTION WHEN others THEN
			v := '{}'::jsonb;
		END;
		IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
			v := '{}'::jsonb;
		END IF;
		UPDATE grafanadb.topic SET message_schema = v WHERE id = r.id;
	END LOOP;
END $$;`;

const queryHistory = `
CREATE TABLE IF NOT EXISTS grafanadb.topic_message_schema(
	id              serial      PRIMARY KEY,
	topic_id        bigint      NOT NULL,
	version         integer     NOT NULL,
	message_schema  jsonb       NOT NULL DEFAULT '{}'::jsonb,
	valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
	valid_to        TIMESTAMPTZ,            -- NULL = current version
	is_current      boolean     NOT NULL DEFAULT true,
	CONSTRAINT fk_topic_id
		FOREIGN KEY (topic_id)
		REFERENCES grafanadb.topic(id)
		ON DELETE CASCADE,
	CONSTRAINT uq_topic_message_schema_version UNIQUE (topic_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_message_schema_current
	ON grafanadb.topic_message_schema(topic_id)
	WHERE is_current = true;

-- version of the schema: +1 when it changes (not when it replaces the empty schema)
CREATE OR REPLACE FUNCTION grafanadb.topic_message_schema_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		NEW.message_schema_version := 1;
	ELSIF NEW.message_schema IS NOT DISTINCT FROM OLD.message_schema OR OLD.message_schema = '{}'::jsonb THEN
		NEW.message_schema_version := OLD.message_schema_version;
	ELSE
		NEW.message_schema_version := OLD.message_schema_version + 1;
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_topic_message_schema_version
	BEFORE INSERT OR UPDATE OF message_schema, message_schema_version ON grafanadb.topic
	FOR EACH ROW
	EXECUTE FUNCTION grafanadb.topic_message_schema_version();

-- history: close the current version and open the new one
CREATE OR REPLACE FUNCTION grafanadb.topic_message_schema_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' THEN
		IF NEW.message_schema IS NOT DISTINCT FROM OLD.message_schema THEN
			RETURN NULL;
		END IF;
		IF NEW.message_schema_version = OLD.message_schema_version THEN
			-- the empty schema of this version is replaced
			UPDATE grafanadb.topic_message_schema
				SET message_schema = NEW.message_schema, valid_from = now()
				WHERE topic_id = NEW.id AND version = NEW.message_schema_version AND is_current = true;
			IF FOUND THEN
				RETURN NULL;
			END IF;
		END IF;
	END IF;

	UPDATE grafanadb.topic_message_schema
		SET valid_to = now(), is_current = false
		WHERE topic_id = NEW.id AND is_current = true;
	INSERT INTO grafanadb.topic_message_schema (topic_id, version, message_schema)
		VALUES (NEW.id, NEW.message_schema_version, NEW.message_schema)
		ON CONFLICT (topic_id, version) DO UPDATE
		SET message_schema = EXCLUDED.message_schema, valid_from = now(), valid_to = NULL, is_current = true;
	RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_topic_message_schema_history
	AFTER INSERT OR UPDATE OF message_schema ON grafanadb.topic
	FOR EACH ROW
	EXECUTE FUNCTION grafanadb.topic_message_schema_history();

-- topics created before the history: their current schema is their first version
INSERT INTO grafanadb.topic_message_schema (topic_id, version, message_schema, valid_from)
	SELECT topic.id, topic.message_schema_version, topic.message_schema, COALESCE(topic.created, now())
	FROM grafanadb.topic AS topic
	WHERE NOT EXISTS (
		SELECT 1 FROM grafanadb.topic_message_schema AS history WHERE history.topic_id = topic.id
	);`;

export const ensureTopicMessageSchema = async (client: PoolClient): Promise<void> => {
	try {
		await client.query(queryColumns);
		await client.query(queryHistory);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The message schema of the topics could not be set up: %s`, message);
	}
};
