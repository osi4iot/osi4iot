package batcher

import (
	"context"
	"dev2pdb/internal/models"
	"sync"
	"time"

	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
	"go.uber.org/zap"
)

type Saver func(ctx context.Context, pool *pgxpool.Pool, batch []models.ThingData) error

type Batcher struct {
    ctx         context.Context
    pool        *pgxpool.Pool
    in          <-chan models.ThingData
    workerCount int
    batchSize   int
    interval    time.Duration
    saveFn      Saver

    sem chan struct{}
    wg  sync.WaitGroup
    buf []models.ThingData
    sugar *zap.SugaredLogger
}

func NewBatcher(
    ctx context.Context, pool *pgxpool.Pool, in <-chan models.ThingData,
    workerCount, batchSize int, interval time.Duration, saveFn Saver, sugar *zap.SugaredLogger,
) *Batcher {
    return &Batcher{
        ctx:         ctx,
        pool:        pool,
        in:          in,
        workerCount: workerCount,
        batchSize:   batchSize,
        interval:    interval,
        saveFn:      saveFn,
        sem:         make(chan struct{}, workerCount),
        sugar: sugar,
    }
}

func (b *Batcher) flush() {
    if len(b.buf) == 0 {
        return
    }
    c := make([]models.ThingData, len(b.buf))
    copy(c, b.buf)
    b.buf = b.buf[:0]

    b.wg.Add(1)
    b.sem <- struct{}{}
    go func(rows []models.ThingData) {
        defer b.wg.Done()
        defer func() { <-b.sem }()
        if err := b.saveFn(b.ctx, b.pool, rows); err != nil {
           b.sugar.Errorf("error saving batch: %v", err)
        }
    }(c)
}

func (b *Batcher) Start() {
    ticker := time.NewTicker(b.interval)
    defer ticker.Stop()

    for {
        select {
        case <-b.ctx.Done():
            b.flush()
            b.wg.Wait()
            return

        case row := <-b.in:
            b.buf = append(b.buf, row)
            if len(b.buf) >= b.batchSize {
                b.flush()
            }

        case <-ticker.C:
            b.flush()
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
