package function_library

import (
	"fmt"
	"pipelines/common"
	"time"
)

type Time struct {
	node        common.Node

	// Duration constants.
	Hour        time.Duration
	Minute      time.Duration
	Second      time.Duration
	Nanosecond  time.Duration
	Millisecond time.Duration

	// Time formats.
	Layout      string
	ANSIC       string
	UnixDate    string
	RubyDate    string
	RFC822      string
	RFC822Z     string // RFC822 with numeric zone
	RFC850      string
	RFC1123     string
	RFC1123Z    string // RFC1123 with numeric zone
	RFC3339     string
	RFC3339Nano string
	Kitchen     string
	// Handy time stamps.
	Stamp      string
	StampMilli string
	StampMicro string
	StampNano  string
	DateTime   string
	DateOnly   string
	TimeOnly   string

	January   time.Month
	February  time.Month
	March     time.Month
	April     time.Month
	May       time.Month
	June      time.Month
	July      time.Month
	August    time.Month
	September time.Month
	October   time.Month
	November  time.Month
	December  time.Month

	Sunday    time.Weekday
	Monday    time.Weekday
	Tuesday   time.Weekday
	Wednesday time.Weekday
	Thursday  time.Weekday
	Friday    time.Weekday
	Saturday  time.Weekday

	UTC   *time.Location
	Local *time.Location
}

func NewTime(node common.Node) *Time {
	return &Time{
		node:        node,
		Hour:        time.Hour,
		Minute:      time.Minute,
		Second:      time.Second,
		Nanosecond:  time.Nanosecond,
		Millisecond: time.Millisecond,
		Layout:      time.Layout,
		ANSIC:       time.ANSIC,
		UnixDate:    time.UnixDate,
		RubyDate:    time.RubyDate,
		RFC822:      time.RFC822,
		RFC822Z:     time.RFC822Z,
		RFC850:      time.RFC850,
		RFC1123:     time.RFC1123,
		RFC1123Z:    time.RFC1123Z,
		RFC3339:     time.RFC3339,
		RFC3339Nano: time.RFC3339Nano,
		Kitchen:     time.Kitchen,
		Stamp:       time.Stamp,
		StampMilli:  time.StampMilli,
		StampMicro:  time.StampMicro,
		StampNano:   time.StampNano,
		DateTime:    time.DateTime,
		DateOnly:    time.DateOnly,
		TimeOnly:    time.TimeOnly,

		January:   time.January,
		February:  time.February,
		March:     time.March,
		April:     time.April,
		May:       time.May,
		June:      time.June,
		July:      time.July,
		August:    time.August,
		September: time.September,
		October:   time.October,
		November:  time.November,
		December:  time.December,

		Sunday:    time.Sunday,
		Monday:    time.Monday,
		Tuesday:   time.Tuesday,
		Wednesday: time.Wednesday,
		Thursday:  time.Thursday,
		Friday:    time.Friday,
		Saturday:  time.Saturday,

		UTC:   time.UTC,
		Local: time.Local,
	}
}

func (t *Time) After(d time.Duration) time.Time {
	return time.Now().Add(d)
}


func (t *Time) Date(year int, month time.Month, day int, hour int, min int, sec int, nsec int) time.Time {
	return time.Date(year, month, day, hour, min, sec, nsec, time.UTC)
}

func (t *Time) Now() time.Time {
	return time.Now()
}

func (t *Time) Parse(layout, value string) *time.Time {
	myTime, err := time.Parse(layout, value)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to parse time: %v", err))
		return nil
	}
	return &myTime
}

func (t *Time) ParseInLocation(layout, value string, loc *time.Location) *time.Time {
	myTime, err := time.ParseInLocation(layout, value, loc)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to parse time in location: %v", err))
		return nil
	}
	return &myTime
}

func (t *Time) GetTimeFromUnix(sec int64, nsec int64) time.Time {
	return time.Unix(sec, nsec)
}

func (t *Time) GetTimeFromUnixMicro(usec int64) time.Time {
	return time.UnixMicro(usec)
}

func (t *Time) GetTimeFromUnixMilli(msec int64) time.Time {
	return time.UnixMilli(msec)
}

func (t *Time) CalculateDuration(d time.Duration) time.Duration {
	return d
}

func (t *Time) ParseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to parse duration: %v", err))
		return 0
	}
	return d
}

func (t *Time) LoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to load location %s: %v", name, err))
		return nil
	}
	return loc
}

func (t *Time) LoadLocationFromTZData(name string, data []byte) *time.Location {
	loc, err := time.LoadLocationFromTZData(name, data)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to load location %s: %v", name, err))
		return nil
	}
	return loc
}

func (t *Time) Since(t1 time.Time) time.Duration {
	return time.Since(t1)
}

func (t *Time) Until(t1 time.Time) time.Duration {
	return time.Until(t1)
}

func (t *Time) Sleep(d time.Duration) {
	time.Sleep(d)
}

// Custom functions
func (t *Time) GetCurrentTime() string {
	return time.Now().UTC().Format(time.RFC3339)
}
