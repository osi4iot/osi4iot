package iotdb

import (
	"context"
	"errors"
	"sync"
	"time"

	"pipelines/logger"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The history recorder writes the alarm and approval events (history.go) in
// batches, so that the nodes never wait for the database: they hand the rows
// over (RecordAlarm, RecordApproval) and go on. One per process, started
// with the flows manager (StartHistoryRecorder); before that, or without a
// database, the rows are dropped.
//
// A batch that fails is retried later with the same rows (their event_id
// makes a retry harmless); while the database is down at most
// historyMaxPending rows wait, the oldest are dropped beyond that.

const (
	historyBatchRows  = 200 // 33 columns per alarm row: far below the 65535 parameters of a statement
	historyInterval   = 2 * time.Second
	historyMaxPending = 20000
	historyQueue      = 5000
)

type HistoryRecorder struct {
	ctx     context.Context
	pool    *pgxpool.Pool
	log     *logger.Logger
	in      chan historyRow
	pending []historyRow
	dropped int
	done    chan struct{}
}

var (
	historyMu       sync.RWMutex
	historyRecorder *HistoryRecorder
)

// StartHistoryRecorder starts the process's recorder; it writes what is
// left when ctx ends (with a few seconds of grace).
func StartHistoryRecorder(ctx context.Context, pool *pgxpool.Pool, log *logger.Logger) *HistoryRecorder {
	r := &HistoryRecorder{ctx: ctx, pool: pool, log: log, in: make(chan historyRow, historyQueue), done: make(chan struct{})}
	historyMu.Lock()
	historyRecorder = r
	historyMu.Unlock()
	go r.run()
	return r
}

// HistoryEnabled says whether the events are recorded (the recorder runs
// with a database): the nodes skip building them otherwise.
func HistoryEnabled() bool {
	historyMu.RLock()
	defer historyMu.RUnlock()
	return historyRecorder != nil && historyRecorder.pool != nil
}

// RecordAlarm hands an alarm event over to the recorder.
func RecordAlarm(rec AlarmRecord) {
	if rec.EventId == "" {
		rec.EventId = NewEventId()
	}
	record(historyRow{"iot_data.alarm", AlarmColumns, AlarmArgs(rec)})
}

// RecordApproval hands an approval event over to the recorder.
func RecordApproval(rec ApprovalRecord) {
	if rec.EventId == "" {
		rec.EventId = NewEventId()
	}
	record(historyRow{"iot_data.approval", ApprovalColumns, ApprovalArgs(rec)})
}

func record(row historyRow) {
	historyMu.RLock()
	r := historyRecorder
	historyMu.RUnlock()
	if r == nil || r.pool == nil {
		return
	}
	select {
	case r.in <- row:
	default:
		// the queue is full (the database is slow): never block a node
		r.log.Warnf("History of alarms and approvals: queue full, an event of %s was not recorded", row.table)
	}
}

// Done is closed when the recorder has finished (after its context ended).
func (r *HistoryRecorder) Done() <-chan struct{} { return r.done }

func (r *HistoryRecorder) run() {
	defer close(r.done)
	ticker := time.NewTicker(historyInterval)
	defer ticker.Stop()
	for {
		select {
		case <-r.ctx.Done():
			r.drain()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			r.flush(ctx)
			cancel()
			return
		case row := <-r.in:
			r.add(row)
			if len(r.pending) >= historyBatchRows {
				r.flush(r.ctx)
			}
		case <-ticker.C:
			r.flush(r.ctx)
		}
	}
}

func (r *HistoryRecorder) drain() {
	for {
		select {
		case row := <-r.in:
			r.add(row)
		default:
			return
		}
	}
}

func (r *HistoryRecorder) add(row historyRow) {
	r.pending = append(r.pending, row)
	if over := len(r.pending) - historyMaxPending; over > 0 {
		r.pending = r.pending[over:]
		r.dropped += over
	}
}

// flush writes the pending rows, a batch per table; what fails stays pending.
func (r *HistoryRecorder) flush(ctx context.Context) {
	if r.dropped > 0 {
		r.log.Warnf("History of alarms and approvals: %d events dropped while the IoT database was not writable", r.dropped)
		r.dropped = 0
	}
	for len(r.pending) > 0 {
		batch := sameTableBatch(r.pending, historyBatchRows)
		args := make([]any, 0, len(batch)*len(batch[0].columns))
		for _, row := range batch {
			args = append(args, row.args...)
		}
		_, err := r.pool.Exec(ctx, InsertSQL(batch[0].table, batch[0].columns, len(batch)), args...)
		if err != nil {
			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) {
				// not reachable: the same rows later
				r.log.Warnf("History of alarms and approvals: writing %d events into %s: %v (retried later)", len(batch), batch[0].table, err)
				return
			}
			// the database refused the statement: row by row, dropping the ones it refuses
			// (retrying them would block the history for good)
			r.writeOneByOne(ctx, batch)
		}
		r.pending = r.pending[len(batch):]
	}
	r.pending = nil
}

func (r *HistoryRecorder) writeOneByOne(ctx context.Context, batch []historyRow) {
	for _, row := range batch {
		if _, err := r.pool.Exec(ctx, InsertSQL(row.table, row.columns, 1), row.args...); err != nil {
			r.log.Warnf("History of alarms and approvals: an event was not recorded in %s: %v", row.table, err)
		}
	}
}
