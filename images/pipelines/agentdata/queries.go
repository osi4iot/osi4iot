package agentdata

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

// The sensors' messages are in the IoT DB (patroni_metrics,
// iot_data.thingData, a TimescaleDB hypertable). Each group reads its own
// through the view iot_datasource.Table_<groupUid> (admin_api's groupDAL:
// timestamp, topic, payload of that group only), as the IoTDB node does;
// a sensor's messages have topic = 'Topic_<topicUid>'. Every query here is
// a parameterized SELECT on that view; only the view's name, checked
// below, is written into the SQL.
//
// The asset states are in iot_data.assetState, read by group_uid.

// DB is what the queries need (a *pgxpool.Pool).
type DB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const queryTimeout = 15 * time.Second

var groupUidRe = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)

func groupView(groupUid string) (string, error) {
	if !groupUidRe.MatchString(groupUid) {
		return "", fmt.Errorf("invalid group uid")
	}
	return "iot_datasource.Table_" + groupUid, nil
}

// valueSQL is the field's value in a message, NULL when it is not a
// number. The field comes as parameters $4 (key) and $5 (array item).
func valueSQL(f Field) (string, []any) {
	if f.Index < 0 {
		return `CASE WHEN jsonb_typeof(payload -> $4::text) = 'number'
			THEN (payload ->> $4::text)::double precision END`, []any{f.Key}
	}
	return `CASE WHEN jsonb_typeof(payload -> $4::text -> $5::int) = 'number'
			THEN (payload -> $4::text ->> $5::int)::double precision END`, []any{f.Key, f.Index}
}

// seriesSQL selects (ts, v) for a sensor's field in [from, to), numbers only.
func seriesSQL(groupUid string, s SensorInfo, f Field, from, to time.Time) (string, []any, error) {
	view, err := groupView(groupUid)
	if err != nil {
		return "", nil, err
	}
	expr, fieldArgs := valueSQL(f)
	sql := fmt.Sprintf(`SELECT ts, v FROM (
		SELECT timestamp AS ts, %s AS v FROM %s
		WHERE topic = $1 AND timestamp >= $2 AND timestamp < $3
	) series WHERE v IS NOT NULL`, expr, view)
	args := append([]any{s.topic, from, to}, fieldArgs...)
	return sql, args, nil
}

// Point is a value at a time.
type Point struct {
	Time  time.Time `json:"time"`
	Value float64   `json:"value"`
}

// Statistics of a field over a range.
type Statistics struct {
	Count int64    `json:"count"`
	Min   *Point   `json:"min,omitempty"`
	Max   *Point   `json:"max,omitempty"`
	Avg   *float64 `json:"avg,omitempty"`
	First *Point   `json:"first,omitempty"`
	Last  *Point   `json:"last,omitempty"`
}

func statistics(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time) (*Statistics, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}

	st := &Statistics{}
	var avg *float64
	if err := db.QueryRow(ctx, `SELECT count(*), avg(v) FROM (`+series+`) s`, args...).Scan(&st.Count, &avg); err != nil {
		return nil, queryError(err)
	}
	st.Avg = avg
	if st.Count == 0 {
		return st, nil
	}
	one := func(order string) (*Point, error) {
		var p Point
		err := db.QueryRow(ctx, `SELECT ts, v FROM (`+series+`) s ORDER BY `+order+` LIMIT 1`, args...).Scan(&p.Time, &p.Value)
		if err != nil {
			return nil, queryError(err)
		}
		p.Time = p.Time.UTC()
		return &p, nil
	}
	if st.Min, err = one("v ASC, ts DESC"); err != nil {
		return nil, err
	}
	if st.Max, err = one("v DESC, ts DESC"); err != nil {
		return nil, err
	}
	if st.First, err = one("ts ASC"); err != nil {
		return nil, err
	}
	if st.Last, err = one("ts DESC"); err != nil {
		return nil, err
	}
	return st, nil
}

// Bucket is an interval of an aggregated history.
type Bucket struct {
	Time  time.Time `json:"time"` // start of the interval
	Avg   float64   `json:"avg"`
	Min   float64   `json:"min"`
	Max   float64   `json:"max"`
	Count int64     `json:"count"`
}

func aggregatedHistory(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time, interval time.Duration) ([]Bucket, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}
	n := len(args) + 1
	sql := fmt.Sprintf(`SELECT time_bucket($%d::interval, ts) AS b, avg(v), min(v), max(v), count(*)
		FROM (%s) s GROUP BY b ORDER BY b LIMIT %d`, n, series, MaxBuckets+1)
	args = append(args, fmt.Sprintf("%d seconds", int64(interval/time.Second)))
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	var out []Bucket
	for rows.Next() {
		var b Bucket
		if err := rows.Scan(&b.Time, &b.Avg, &b.Min, &b.Max, &b.Count); err != nil {
			return nil, queryError(err)
		}
		b.Time = b.Time.UTC()
		out = append(out, b)
	}
	return out, queryError(rows.Err())
}

// rawHistory returns the last limit values of the range, oldest first.
func rawHistory(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time, limit int) ([]Point, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, false, err
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`SELECT ts, v FROM (%s) s ORDER BY ts DESC LIMIT %d`, series, limit+1), args...)
	if err != nil {
		return nil, false, queryError(err)
	}
	defer rows.Close()
	var out []Point
	for rows.Next() {
		var p Point
		if err := rows.Scan(&p.Time, &p.Value); err != nil {
			return nil, false, queryError(err)
		}
		p.Time = p.Time.UTC()
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, false, queryError(err)
	}
	truncated := len(out) > limit
	if truncated {
		out = out[:limit]
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, truncated, nil
}

// Message is a message of a sensor's topic.
type Message struct {
	Time    time.Time      `json:"time"`
	Payload map[string]any `json:"payload"`
}

func latestMessages(ctx context.Context, db DB, groupUid string, s SensorInfo, count int) ([]Message, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	view, err := groupView(groupUid)
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`SELECT timestamp, payload FROM %s
		WHERE topic = $1 ORDER BY timestamp DESC LIMIT %d`, view, count), s.topic)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.Time, &m.Payload); err != nil {
			return nil, queryError(err)
		}
		m.Time = m.Time.UTC()
		out = append(out, m)
	}
	return out, queryError(rows.Err())
}

// AssetStateRow is an asset's state as iot_data.assetState has it.
type AssetStateRow struct {
	State       map[string]any
	LastUpdated *time.Time
}

func assetStates(ctx context.Context, db DB, groupUid string) (map[string]AssetStateRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	rows, err := db.Query(ctx, `SELECT asset_uid, state, last_updated FROM iot_data.assetState WHERE group_uid = $1`, groupUid)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	out := map[string]AssetStateRow{}
	for rows.Next() {
		var uid string
		var r AssetStateRow
		if err := rows.Scan(&uid, &r.State, &r.LastUpdated); err != nil {
			return nil, queryError(err)
		}
		if r.LastUpdated != nil {
			t := r.LastUpdated.UTC()
			r.LastUpdated = &t
		}
		out[uid] = r
	}
	return out, queryError(rows.Err())
}

func queryError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("the query took too long: use a shorter range or a larger interval")
	}
	return fmt.Errorf("IoT DB: %w", err)
}
