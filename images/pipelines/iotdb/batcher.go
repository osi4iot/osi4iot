package iotdb

import (
	"context"
	"pipelines/common"
	"pipelines/logger"
	"sync"
	"time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/jackc/pgx/v5"
)

type Saver func(ctx context.Context, pool *pgxpool.Pool, batch []common.ThingData) error

type Batcher struct {
    ctx         context.Context
    pool        *pgxpool.Pool
    in          <-chan common.ThingData
    workerCount int
    batchSize   int
    interval    time.Duration

    sem chan struct{}
    wg  sync.WaitGroup
    buf []common.ThingData
    log *logger.Logger
}

func NewBatcher(
    ctx context.Context, 
    pool *pgxpool.Pool, 
    in <-chan common.ThingData,
    workerCount, batchSize int,
    interval time.Duration, 
    log *logger.Logger,
) *Batcher {
    return &Batcher{
        ctx:         ctx,
        pool:        pool,
        in:          in,
        workerCount: workerCount,
        batchSize:   batchSize,
        interval:    interval,
        sem:         make(chan struct{}, workerCount),
        log:         log,
    }
}

func (b *Batcher) flush() {
    if len(b.buf) == 0 {
        return
    }
    c := make([]common.ThingData, len(b.buf))
    copy(c, b.buf)
    b.buf = b.buf[:0]

    b.wg.Add(1)
    b.sem <- struct{}{}
    go func(rows []common.ThingData) {
        defer b.wg.Done()
        defer func() { <-b.sem }()
        if err := b.CopyFromSaver(b.ctx, b.pool, rows); err != nil {
           b.log.Errorf("error saving batch: %v", err)
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

func (b *Batcher) CopyFromSaver(ctx context.Context, pool *pgxpool.Pool, batch []common.ThingData) error {
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
