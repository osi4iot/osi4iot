package utils

import (
	"encoding/json"
	"fmt"
	"time"
)

type Timestamp time.Time


// MarshalJSON converts Timestamp to JSON.
func (t Timestamp) MarshalJSON() ([]byte, error) {
	timestamp := time.Time(t).Format("2006-01-02T15:04:05.000Z") // ISO 8601 format with milliseconds
	return json.Marshal(timestamp)
}

// UnmarshalJSON can parse both numbers (unix millis) and strings (ISO 8601)
func (t *Timestamp) UnmarshalJSON(data []byte) error {
	// Try to parse as a number first
	var timestamp int64
	if err := json.Unmarshal(data, &timestamp); err == nil {
		*t = Timestamp(time.UnixMilli(timestamp))
		return nil
	}

	// If it fails, try to parse as a string
	var timeStr string
	if err := json.Unmarshal(data, &timeStr); err != nil {
		return fmt.Errorf("timestamp must be a number (unix millis) or string (ISO 8601): %v", err)
	}

	// Try various date formats
	formats := []string{
		time.RFC3339Nano,           // "2006-01-02T15:04:05.999999999Z07:00"
		time.RFC3339,               // "2006-01-02T15:04:05Z07:00"
		"2006-01-02T15:04:05.000Z", // With milliseconds and Z
		"2006-01-02T15:04:05Z",     // Without milliseconds with Z
		"2006-01-02T15:04:05.000",  // With milliseconds without timezone
		"2006-01-02T15:04:05",      // Without milliseconds without timezone
		"2006-01-02 15:04:05.000",  // Format with space
		"2006-01-02 15:04:05",      // Format with space without milliseconds
	}

	var parsedTime time.Time
	var err error

	for _, format := range formats {
		parsedTime, err = time.Parse(format, timeStr)
		if err == nil {
			*t = Timestamp(parsedTime)
			return nil
		}
	}

	return fmt.Errorf("could not parse the timestamp string '%s': %v", timeStr, err)
}

// String implements the String method to display the time in a readable format
func (t Timestamp) String() string {
	return time.Time(t).Format("2006-01-02 15:04:05.000")
}

// Time converts Timestamp to time.Time
func (t Timestamp) Time() time.Time {
	return time.Time(t)
}

// UnixMilli returns the timestamp in milliseconds
func (t Timestamp) UnixMilli() int64 {
	return time.Time(t).UnixMilli()
}

// ISO8601 returns the timestamp in ISO 8601 format
func (t Timestamp) ISO8601() string {
	return time.Time(t).Format(time.RFC3339Nano)
}

// IsZero reports whether the timestamp represents the zero moment
func (t Timestamp) IsZero() bool {
	return time.Time(t).IsZero()
}

func (t Timestamp) Now() Timestamp {
	return Timestamp(time.Now())
}
