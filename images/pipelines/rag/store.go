package rag

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the rag schema in patroni_admin: one row per document in
// rag.documents and its chunks, with their embeddings, in rag.chunks.
//
// The tables and indexes are created the first time they are needed, and
// again after a failure (e.g. the database was not reachable yet). The
// role, the rag schema and the extensions are created by post_init.sh
// when the Patroni cluster is bootstrapped.
type Store struct {
	pool *pgxpool.Pool

	mu    sync.Mutex
	ready bool
}

// Document is a row of rag.documents.
type Document struct {
	ID           int64
	OrgID        int
	GroupID      int
	S3Key        string
	FileName     string
	LastModified string
	Status       string
	NumChunks    int
	Error        string
}

// Document statuses.
const (
	StatusIndexing = "indexing"
	StatusReady    = "ready"
	StatusError    = "error"
)

// SearchResult is one chunk found by Search.
type SearchResult struct {
	FileName string  `json:"file"`
	Title    string  `json:"title,omitempty"`
	Location string  `json:"location,omitempty"`
	Content  string  `json:"content"`
	Score    float64 `json:"score"`
}

const schemaSQL = `
CREATE TABLE IF NOT EXISTS rag.documents (
    id            bigserial PRIMARY KEY,
    org_id        integer     NOT NULL,
    group_id      integer     NOT NULL,
    s3_key        text        NOT NULL UNIQUE,
    file_name     text        NOT NULL,
    last_modified text        NOT NULL,
    status        text        NOT NULL,
    num_chunks    integer     NOT NULL DEFAULT 0,
    error         text,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_group_idx ON rag.documents (group_id);

CREATE TABLE IF NOT EXISTS rag.chunks (
    id          bigserial PRIMARY KEY,
    document_id bigint  NOT NULL REFERENCES rag.documents (id) ON DELETE CASCADE,
    group_id    integer NOT NULL,
    chunk_index integer NOT NULL,
    location    text,
    content     text    NOT NULL,
    embedding   vector(` + "384" + `) NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON rag.chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_group_idx ON rag.chunks (group_id);
-- Semantic search: HNSW over cosine distance (pgvector).
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON rag.chunks
    USING hnsw (embedding vector_cosine_ops);
-- Keyword search: BM25 with pg_textsearch, whose index is WAL-logged like
-- PostgreSQL's own, so the Patroni replicas replay it (pg_search's
-- community edition, used before, stops them: "replicas are not supported
-- on community"). The 'simple' text configuration: no stemming and no stop
-- words, any language; this part is for exact terms such as codes and
-- references, the meaning is pgvector's. The group filter is applied
-- first, with chunks_group_idx.
CREATE INDEX IF NOT EXISTS chunks_content_bm25_idx ON rag.chunks
    USING bm25 (content) WITH (text_config = 'simple');
-- A plain full-text column of an intermediate version, unused.
ALTER TABLE rag.chunks DROP COLUMN IF EXISTS content_tsv;
`

// NewStore connects to the knowledge bases' database. The connection is
// lazy: nothing fails here if the database is not reachable yet.
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("knowledge database: %w", err)
	}
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("knowledge database: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close closes the pool.
func (s *Store) Close() { s.pool.Close() }

// Ready creates the tables and indexes if needed.
func (s *Store) Ready(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ready {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if _, err := s.pool.Exec(ctx, schemaSQL); err != nil {
		return fmt.Errorf("knowledge database not ready (rag schema): %w", err)
	}
	s.ready = true
	return nil
}

// GetDocument returns the document with this S3 key, or nil.
func (s *Store) GetDocument(ctx context.Context, s3Key string) (*Document, error) {
	var d Document
	var errText *string
	err := s.pool.QueryRow(ctx, `SELECT id, org_id, group_id, s3_key, file_name, last_modified, status, num_chunks, error
		FROM rag.documents WHERE s3_key = $1`, s3Key).
		Scan(&d.ID, &d.OrgID, &d.GroupID, &d.S3Key, &d.FileName, &d.LastModified, &d.Status, &d.NumChunks, &errText)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if errText != nil {
		d.Error = *errText
	}
	return &d, nil
}

// GroupDocuments returns the S3 keys of a group's documents.
func (s *Store) GroupDocuments(ctx context.Context, groupID int) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT s3_key FROM rag.documents WHERE group_id = $1`, groupID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// MarkIndexing creates or resets the document's row before indexing.
func (s *Store) MarkIndexing(ctx context.Context, d Document) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `INSERT INTO rag.documents (org_id, group_id, s3_key, file_name, last_modified, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (s3_key) DO UPDATE SET last_modified = EXCLUDED.last_modified, status = EXCLUDED.status,
			error = NULL, updated_at = now()
		RETURNING id`, d.OrgID, d.GroupID, d.S3Key, d.FileName, d.LastModified, StatusIndexing).Scan(&id)
	return id, err
}

// MarkError records why a document could not be indexed.
func (s *Store) MarkError(ctx context.Context, docID int64, cause error) error {
	_, err := s.pool.Exec(ctx, `UPDATE rag.documents SET status = $2, error = $3, num_chunks = 0, updated_at = now()
		WHERE id = $1`, docID, StatusError, cause.Error())
	return err
}

// ReplaceChunks replaces a document's chunks and marks it ready, in one
// transaction: searches see either the old chunks or the new ones.
func (s *Store) ReplaceChunks(ctx context.Context, docID int64, groupID int, chunks []Chunk, vectors [][]float32) error {
	if len(chunks) != len(vectors) {
		return fmt.Errorf("%d chunks but %d embeddings", len(chunks), len(vectors))
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM rag.chunks WHERE document_id = $1`, docID); err != nil {
		return err
	}
	batch := &pgx.Batch{}
	for i, c := range chunks {
		batch.Queue(`INSERT INTO rag.chunks (document_id, group_id, chunk_index, location, content, embedding)
			VALUES ($1, $2, $3, $4, $5, $6::vector)`,
			docID, groupID, c.Index, nullIfEmpty(c.Location), c.Content, vectorLiteral(vectors[i]))
	}
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("error storing the chunks: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE rag.documents SET status = $2, num_chunks = $3, error = NULL, updated_at = now()
		WHERE id = $1`, docID, StatusReady, len(chunks)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeleteDocument removes a document and its chunks.
func (s *Store) DeleteDocument(ctx context.Context, s3Key string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM rag.documents WHERE s3_key = $1`, s3Key)
	return err
}

// DeleteGroup removes a group's knowledge base.
func (s *Store) DeleteGroup(ctx context.Context, groupID int) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM rag.documents WHERE group_id = $1`, groupID)
	return err
}

// DeleteGroupsNotIn removes the knowledge bases of groups that no longer
// exist.
func (s *Store) DeleteGroupsNotIn(ctx context.Context, groupIDs []int) (int64, error) {
	ids := make([]int32, len(groupIDs))
	for i, id := range groupIDs {
		ids[i] = int32(id)
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM rag.documents WHERE NOT (group_id = ANY($1))`, ids)
	return tag.RowsAffected(), err
}

// searchSQL is the hybrid search: the best chunks by meaning (pgvector,
// cosine distance) and by words (BM25, pg_textsearch: chunks with any of
// the question's words), each ranked, fused
// with Reciprocal Rank Fusion: score = Σ 1/(60 + rank). A chunk found by
// both rises to the top; one found by only one still counts.
const searchSQL = `
WITH semantic AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY distance) AS rank
    FROM (
        SELECT id, embedding <=> $1::vector AS distance
        FROM rag.chunks
        WHERE group_id = $2 AND document_id = ANY($6::bigint[])
        ORDER BY embedding <=> $1::vector
        LIMIT $4
    ) s
),
keyword AS (
    -- <@> gives the BM25 score negated (lower is better), and 0 to a
    -- chunk without any of the words: those are not candidates.
    SELECT id, ROW_NUMBER() OVER (ORDER BY score) AS rank
    FROM (
        SELECT id, content <@> to_bm25query($3, 'rag.chunks_content_bm25_idx') AS score
        FROM rag.chunks
        WHERE group_id = $2 AND document_id = ANY($6::bigint[])
        ORDER BY content <@> to_bm25query($3, 'rag.chunks_content_bm25_idx')
        LIMIT $4
    ) k
    WHERE score < 0
),
fused AS (
    SELECT COALESCE(s.id, k.id) AS id,
           COALESCE(1.0 / (60 + s.rank), 0) + COALESCE(1.0 / (60 + k.rank), 0) AS score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
)
SELECT d.file_name, COALESCE(c.location, ''), c.content, f.score::float8
FROM fused f
JOIN rag.chunks c ON c.id = f.id
JOIN rag.documents d ON d.id = c.document_id
WHERE d.status = 'ready'
ORDER BY f.score DESC
LIMIT $5`

// Search returns the best chunks for a question among some documents of a
// group (rag.documents ids).
func (s *Store) Search(ctx context.Context, groupID int, documentIDs []int64, query string, queryVector []float32, topK int) ([]SearchResult, error) {
	if len(documentIDs) == 0 {
		return nil, nil
	}
	candidates := max(topK*5, 40)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	// pgvector >= 0.8: keep scanning the HNSW index until enough rows
	// pass the group filter, instead of returning fewer than asked.
	if _, err := tx.Exec(ctx, `SET LOCAL hnsw.iterative_scan = relaxed_order`); err != nil {
		return nil, err
	}

	rows, err := tx.Query(ctx, searchSQL, vectorLiteral(queryVector), groupID, query, candidates, topK, documentIDs)
	if err != nil {
		return nil, fmt.Errorf("knowledge search failed: %w", err)
	}
	results, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (SearchResult, error) {
		var r SearchResult
		err := row.Scan(&r.FileName, &r.Location, &r.Content, &r.Score)
		return r, err
	})
	if err != nil {
		return nil, fmt.Errorf("knowledge search failed: %w", err)
	}
	return results, tx.Commit(ctx)
}

// AllowedDocument is a document of a group's knowledge base that a
// digital twin's AI agents may read (admin_api's
// grafanadb.digital_twin_knowledge_document), with its title and how far
// its indexing got.
type AllowedDocument struct {
	FileName   string `json:"file"`
	Title      string `json:"title"`
	Status     string `json:"status"` // pending (not indexed yet), indexing, ready, error
	NumChunks  int    `json:"chunks"`
	DocumentID int64  `json:"-"` // rag.documents id; 0 when not indexed
}

// allowedDocumentsSQL reads admin_api's tables (SELECT granted to this
// role by admin_api) joined with the index. The title is the file name
// when there is none.
const allowedDocumentsSQL = `
SELECT dk.file_name,
       COALESCE(NULLIF(kd.title, ''), dk.file_name),
       COALESCE(d.status, 'pending'),
       COALESCE(d.num_chunks, 0),
       COALESCE(d.id, 0)
FROM grafanadb.digital_twin_knowledge_document dk
JOIN grafanadb.knowledge_document kd
     ON kd.group_id = dk.group_id AND kd.file_name = dk.file_name
LEFT JOIN rag.documents d
     ON d.group_id = dk.group_id AND d.file_name = dk.file_name
WHERE dk.digital_twin_id = $1 AND dk.group_id = $2
ORDER BY 2, 1`

// DigitalTwinDocuments returns the documents of its group a digital
// twin's agents may read: none unless chosen in the digital twin.
func (s *Store) DigitalTwinDocuments(ctx context.Context, groupID, digitalTwinID int) ([]AllowedDocument, error) {
	rows, err := s.pool.Query(ctx, allowedDocumentsSQL, digitalTwinID, groupID)
	if err != nil {
		return nil, fmt.Errorf("error reading the documents of digital twin %d (does admin_api grant SELECT on grafanadb.knowledge_document to this role?): %w", digitalTwinID, err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (AllowedDocument, error) {
		var d AllowedDocument
		err := row.Scan(&d.FileName, &d.Title, &d.Status, &d.NumChunks, &d.DocumentID)
		return d, err
	})
}

// vectorLiteral formats a vector for pgvector's text input: [0.1,0.2,...].
func vectorLiteral(v []float32) string {
	var b strings.Builder
	b.Grow(len(v) * 10)
	b.WriteByte('[')
	for i, x := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(x), 'g', 7, 32))
	}
	b.WriteByte(']')
	return b.String()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
