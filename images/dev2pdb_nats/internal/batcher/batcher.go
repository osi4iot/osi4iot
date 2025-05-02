// internal/batcher/batcher.go
package batcher

import (
	"context"
	"dev2pdb/internal/models"
	"time"

	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
)

type Saver func(ctx context.Context, pool *pgxpool.Pool, batch []models.ThingData) error

func Start(ctx context.Context, pool *pgxpool.Pool, in <-chan models.ThingData,
    batchSize int, interval time.Duration, saveFn Saver) {

    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    var batch []models.ThingData

    for {
        select {
        case <-ctx.Done():
            if len(batch) > 0 {
                saveFn(ctx, pool, batch)
            }
            return
        case row := <-in:
            batch = append(batch, row)
            if len(batch) >= batchSize {
                saveFn(ctx, pool, batch)
                batch = batch[:0]
            }
        case <-ticker.C:
            if len(batch) > 0 {
                saveFn(ctx, pool, batch)
                batch = batch[:0]
            }
        }
    }
}

func CopyFromSaver(ctx context.Context, pool *pgxpool.Pool, batch []models.ThingData) error {
    rows := make([][]interface{}, len(batch))
    for i, r := range batch {
        rows[i] = []interface{}{r.GroupUID, r.TopicUID, r.Topic, r.Payload, r.Timestamp, r.Deleted}
    }
    _, err := pool.CopyFrom(ctx,
        pgx.Identifier{"iot_data", "thingdata"},
        []string{"group_uid", "topic_uid", "topic", "payload", "timestamp", "deleted"},
        pgx.CopyFromRows(rows),
    )
    return err
}
