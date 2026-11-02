package agentdata

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
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
	RMS   float64   `json:"rms"` // root mean square: the level of a vibration
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
	sql := fmt.Sprintf(`SELECT time_bucket($%d::interval, ts) AS b, avg(v), min(v), max(v), sqrt(avg(v*v)), count(*)
		FROM (%s) s GROUP BY b ORDER BY b LIMIT %d`, n, series, MaxBuckets+1)
	args = append(args, intervalArg(interval))
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	var out []Bucket
	for rows.Next() {
		var b Bucket
		if err := rows.Scan(&b.Time, &b.Avg, &b.Min, &b.Max, &b.RMS, &b.Count); err != nil {
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

// intervalArg is an interval as the SQL takes it (down to microseconds:
// fast sensors need intervals below a second).
func intervalArg(d time.Duration) string {
	return fmt.Sprintf("%d microseconds", d.Microseconds())
}

func queryError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("the query took more than %s: the range has too many values (a fast sensor over a long time). "+
			"Use a shorter range, or a larger interval", queryTimeout)
	}
	return fmt.Errorf("IoT DB: %w", err)
}

// ---- Several fields of a sensor at once (sensor-history with fields) ----

// multiValueSQL gives the value expressions of several fields, with their
// parameters numbered from first.
func multiValueSQL(fields []Field, first int) ([]string, []any) {
	exprs := make([]string, 0, len(fields))
	var args []any
	n := first
	for _, f := range fields {
		if f.Index < 0 {
			exprs = append(exprs, fmt.Sprintf(`CASE WHEN jsonb_typeof(payload -> $%d::text) = 'number'
				THEN (payload ->> $%d::text)::double precision END`, n, n))
			args = append(args, f.Key)
			n++
			continue
		}
		exprs = append(exprs, fmt.Sprintf(`CASE WHEN jsonb_typeof(payload -> $%d::text -> $%d::int) = 'number'
				THEN (payload -> $%d::text ->> $%d::int)::double precision END`, n, n+1, n, n+1))
		args = append(args, f.Key, f.Index)
		n += 2
	}
	return exprs, args
}

// multiSeriesSQL selects (ts, v0, v1, …) of a sensor's messages in
// [from, to) that have at least one of the fields.
func multiSeriesSQL(groupUid string, s SensorInfo, fields []Field, from, to time.Time) (string, []any, error) {
	view, err := groupView(groupUid)
	if err != nil {
		return "", nil, err
	}
	exprs, fieldArgs := multiValueSQL(fields, 4)
	cols := make([]string, len(exprs))
	notNull := make([]string, len(exprs))
	for i, e := range exprs {
		cols[i] = fmt.Sprintf("%s AS v%d", e, i)
		notNull[i] = fmt.Sprintf("v%d IS NOT NULL", i)
	}
	sql := fmt.Sprintf(`SELECT * FROM (
		SELECT timestamp AS ts, %s FROM %s
		WHERE topic = $1 AND timestamp >= $2 AND timestamp < $3
	) series WHERE %s`, strings.Join(cols, ", "), view, strings.Join(notNull, " OR "))
	return sql, append([]any{s.topic, from, to}, fieldArgs...), nil
}

// Row is a message with the values of several fields (nil: not in it).
type Row struct {
	Time   time.Time  `json:"time"`
	Values []*float64 `json:"values"`
}

// rawRows returns the last limit messages of the range, oldest first.
func rawRows(ctx context.Context, db DB, groupUid string, s SensorInfo, fields []Field, from, to time.Time, limit int) ([]Row, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := multiSeriesSQL(groupUid, s, fields, from, to)
	if err != nil {
		return nil, false, err
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`SELECT * FROM (%s) s ORDER BY ts DESC LIMIT %d`, series, limit+1), args...)
	if err != nil {
		return nil, false, queryError(err)
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		r := Row{Values: make([]*float64, len(fields))}
		dest := []any{&r.Time}
		for i := range r.Values {
			dest = append(dest, &r.Values[i])
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, false, queryError(err)
		}
		r.Time = r.Time.UTC()
		out = append(out, r)
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

// BucketRow is an interval with the average, minimum, maximum and count of
// several fields (nil when a field has no values in it).
type BucketRow struct {
	Time  time.Time  `json:"time"`
	Avg   []*float64 `json:"avg"`
	Min   []*float64 `json:"min"`
	Max   []*float64 `json:"max"`
	Count []int64    `json:"count"`
}

func aggregatedRows(ctx context.Context, db DB, groupUid string, s SensorInfo, fields []Field, from, to time.Time, interval time.Duration) ([]BucketRow, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := multiSeriesSQL(groupUid, s, fields, from, to)
	if err != nil {
		return nil, err
	}
	aggs := make([]string, 0, 4*len(fields))
	for i := range fields {
		aggs = append(aggs, fmt.Sprintf("avg(v%d), min(v%d), max(v%d), count(v%d)", i, i, i, i))
	}
	n := len(args) + 1
	sql := fmt.Sprintf(`SELECT time_bucket($%d::interval, ts) AS b, %s
		FROM (%s) s GROUP BY b ORDER BY b LIMIT %d`, n, strings.Join(aggs, ", "), series, MaxBuckets+1)
	args = append(args, intervalArg(interval))
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	var out []BucketRow
	for rows.Next() {
		b := BucketRow{
			Avg: make([]*float64, len(fields)), Min: make([]*float64, len(fields)),
			Max: make([]*float64, len(fields)), Count: make([]int64, len(fields)),
		}
		dest := []any{&b.Time}
		for i := range fields {
			dest = append(dest, &b.Avg[i], &b.Min[i], &b.Max[i], &b.Count[i])
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, queryError(err)
		}
		b.Time = b.Time.UTC()
		out = append(out, b)
	}
	return out, queryError(rows.Err())
}

// ---- Charts ----

// Exceedance tells how the values of a field stand against a threshold.
type Exceedance struct {
	Threshold  float64    `json:"threshold"`
	Above      int64      `json:"above"` // values above it
	Below      int64      `json:"below"` // values below it
	FirstAbove *time.Time `json:"first_above,omitempty"`
	LastAbove  *time.Time `json:"last_above,omitempty"`
}

func exceedances(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time, ts []Threshold) ([]Exceedance, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}
	cols := make([]string, 0, 4*len(ts))
	for _, t := range ts {
		args = append(args, t.Value)
		n := len(args)
		cols = append(cols, fmt.Sprintf(`count(*) FILTER (WHERE v > $%[1]d::double precision),
			min(ts) FILTER (WHERE v > $%[1]d::double precision), max(ts) FILTER (WHERE v > $%[1]d::double precision),
			count(*) FILTER (WHERE v < $%[1]d::double precision)`, n))
	}
	out := make([]Exceedance, len(ts))
	dest := make([]any, 0, 4*len(ts))
	for i := range out {
		out[i].Threshold = ts[i].Value
		dest = append(dest, &out[i].Above, &out[i].FirstAbove, &out[i].LastAbove, &out[i].Below)
	}
	if err := db.QueryRow(ctx, `SELECT `+strings.Join(cols, ", ")+` FROM (`+series+`) s`, args...).Scan(dest...); err != nil {
		return nil, queryError(err)
	}
	for i := range out {
		for _, t := range []**time.Time{&out[i].FirstAbove, &out[i].LastAbove} {
			if *t != nil {
				u := (*t).UTC()
				*t = &u
			}
		}
	}
	return out, nil
}

// aggregatedHistoryN is aggregatedHistory with its own bound on the
// intervals (charts over long ranges need more than MaxBuckets).
func aggregatedHistoryN(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time, interval time.Duration, limit int) ([]Bucket, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}
	n := len(args) + 1
	sql := fmt.Sprintf(`SELECT time_bucket($%d::interval, ts) AS b, avg(v), min(v), max(v), sqrt(avg(v*v)), count(*)
		FROM (%s) s GROUP BY b ORDER BY b LIMIT %d`, n, series, limit)
	args = append(args, intervalArg(interval))
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	var out []Bucket
	for rows.Next() {
		var b Bucket
		if err := rows.Scan(&b.Time, &b.Avg, &b.Min, &b.Max, &b.RMS, &b.Count); err != nil {
			return nil, queryError(err)
		}
		b.Time = b.Time.UTC()
		out = append(out, b)
	}
	return out, queryError(rows.Err())
}

// Quantiles are the minimum, quartiles, maximum, 5th and 95th percentiles
// of a field's values (in an interval, or over the whole range).
type Quantiles struct {
	Time   time.Time `json:"time,omitempty"`
	Count  int64     `json:"count"`
	Min    float64   `json:"min"`
	P05    float64   `json:"p05"`
	Q1     float64   `json:"q1"`
	Median float64   `json:"median"`
	Q3     float64   `json:"q3"`
	P95    float64   `json:"p95"`
	Max    float64   `json:"max"`
	Avg    float64   `json:"avg"`
	StdDev float64   `json:"std_dev"`
}

const quantilesSQL = `count(*), min(v),
	percentile_cont(0.05) WITHIN GROUP (ORDER BY v), percentile_cont(0.25) WITHIN GROUP (ORDER BY v),
	percentile_cont(0.5) WITHIN GROUP (ORDER BY v), percentile_cont(0.75) WITHIN GROUP (ORDER BY v),
	percentile_cont(0.95) WITHIN GROUP (ORDER BY v), max(v), avg(v), coalesce(stddev_samp(v), 0)`

func scanQuantiles(q *Quantiles) []any {
	return []any{&q.Count, &q.Min, &q.P05, &q.Q1, &q.Median, &q.Q3, &q.P95, &q.Max, &q.Avg, &q.StdDev}
}

// quantiles over the whole range; Count 0 when there are no values.
func quantiles(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time) (*Quantiles, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}
	var count int64
	if err := db.QueryRow(ctx, `SELECT count(*) FROM (`+series+`) s`, args...).Scan(&count); err != nil {
		return nil, queryError(err)
	}
	q := &Quantiles{}
	if count == 0 {
		return q, nil
	}
	if err := db.QueryRow(ctx, `SELECT `+quantilesSQL+` FROM (`+series+`) s`, args...).Scan(scanQuantiles(q)...); err != nil {
		return nil, queryError(err)
	}
	return q, nil
}

// quantilesByPeriod: the quantiles of each interval.
func quantilesByPeriod(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time, interval time.Duration, limit int) ([]Quantiles, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}
	n := len(args) + 1
	args = append(args, intervalArg(interval))
	rows, err := db.Query(ctx, fmt.Sprintf(`SELECT time_bucket($%d::interval, ts) AS b, %s
		FROM (%s) s GROUP BY b ORDER BY b LIMIT %d`, n, quantilesSQL, series, limit), args...)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	var out []Quantiles
	for rows.Next() {
		var q Quantiles
		if err := rows.Scan(append([]any{&q.Time}, scanQuantiles(&q)...)...); err != nil {
			return nil, queryError(err)
		}
		q.Time = q.Time.UTC()
		out = append(out, q)
	}
	return out, queryError(rows.Err())
}

// histogram counts the values of [lo, hi] in bins equal bins (the last one
// includes hi).
func histogram(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time, lo, hi float64, bins int) ([]int64, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return nil, err
	}
	n := len(args)
	args = append(args, lo, hi, bins)
	rows, err := db.Query(ctx, fmt.Sprintf(`SELECT least(width_bucket(v, $%d::double precision, $%d::double precision, $%d::int), $%d::int) AS k, count(*)
		FROM (%s) s WHERE v >= $%d::double precision AND v <= $%d::double precision GROUP BY k ORDER BY k`,
		n+1, n+2, n+3, n+3, series, n+1, n+2), args...)
	if err != nil {
		return nil, queryError(err)
	}
	defer rows.Close()
	counts := make([]int64, bins)
	for rows.Next() {
		var k int
		var c int64
		if err := rows.Scan(&k, &c); err != nil {
			return nil, queryError(err)
		}
		if k >= 1 && k <= bins {
			counts[k-1] += c
		}
	}
	return counts, queryError(rows.Err())
}

// seriesCount is how many values a field has in the range (a chart draws
// them one by one when they are few).
func seriesCount(ctx context.Context, db DB, groupUid string, s SensorInfo, f Field, from, to time.Time) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	series, args, err := seriesSQL(groupUid, s, f, from, to)
	if err != nil {
		return 0, err
	}
	var n int64
	if err := db.QueryRow(ctx, `SELECT count(*) FROM (`+series+`) s`, args...).Scan(&n); err != nil {
		return 0, queryError(err)
	}
	return n, nil
}
