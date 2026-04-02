package timeparser

import (
    "fmt"
    "regexp"
    "strconv"
    "strings"
    "time"
)

type GrafanaTimeParser struct {
    referenceTime time.Time
    timezone      *time.Location
}

func NewGrafanaTimeParser(tz *time.Location) *GrafanaTimeParser {
    if tz == nil {
        tz = time.Local
    }
    return &GrafanaTimeParser{
        referenceTime: time.Now().In(tz),
        timezone:      tz,
    }
}

func (gtp *GrafanaTimeParser) Parse(timeStr string) (time.Time, error) {
    timeStr = strings.TrimSpace(timeStr)
    
    // Special keywords
    switch timeStr {
    case "now":
        return gtp.referenceTime, nil
    case "now/d":
        return gtp.startOfDay(gtp.referenceTime), nil
    case "now/w":
        return gtp.startOfWeek(gtp.referenceTime), nil
    case "now/M":
        return gtp.startOfMonth(gtp.referenceTime), nil
    case "now/y":
        return gtp.startOfYear(gtp.referenceTime), nil
    }
    
	// Expressions with operators like now-5m, now-1h/h, now-1d/d+2h
    if strings.HasPrefix(timeStr, "now") {
        return gtp.parseRelativeTime(timeStr)
    }
    
    // Timestamps Unix
    if timestamp, err := strconv.ParseInt(timeStr, 10, 64); err == nil {
        if timestamp > 1e12 {
            return time.UnixMilli(timestamp).In(gtp.timezone), nil
        }
        return time.Unix(timestamp, 0).In(gtp.timezone), nil
    }
    
	// Absolute time formats
    return gtp.parseAbsoluteTime(timeStr)
}

func (gtp *GrafanaTimeParser) parseRelativeTime(timeStr string) (time.Time, error) {
    result := gtp.referenceTime
    
    // Remove "now" prefix
    timeStr = strings.TrimPrefix(timeStr, "now")
    
    // Complex pattern: now-5m/m or now-1d/d+2h
    parts := strings.Split(timeStr, "/")
    
    // First part: arithmetic operations (now-5m)
    if len(parts[0]) > 0 {
        operations := gtp.parseOperations(parts[0])
        for _, op := range operations {
            var err error
            result, err = gtp.applyOperation(result, op)
            if err != nil {
                return time.Time{}, err
            }
        }
    }
    
    // Second part: rounding (/m, /h, /d)
    if len(parts) > 1 {
        roundTo := parts[1]
        
        // There may be more operations after rounding
        extraOps := ""
        if idx := strings.IndexAny(roundTo, "+-"); idx != -1 {
            extraOps = roundTo[idx:]
            roundTo = roundTo[:idx]
        }
        
        result = gtp.roundTime(result, roundTo)
        
        // Apply additional operations
        if extraOps != "" {
            operations := gtp.parseOperations(extraOps)
            for _, op := range operations {
                var err error
                result, err = gtp.applyOperation(result, op)
                if err != nil {
                    return time.Time{}, err
                }
            }
        }
    }
    
    return result, nil
}

type operation struct {
    operator string // + o -
    amount   int
    unit     string
}

func (gtp *GrafanaTimeParser) parseOperations(ops string) []operation {
    pattern := regexp.MustCompile(`([+-])(\d+)(s|m|h|d|w|M|y)`)
    matches := pattern.FindAllStringSubmatch(ops, -1)
    
    var operations []operation
    for _, match := range matches {
        amount, _ := strconv.Atoi(match[2])
        operations = append(operations, operation{
            operator: match[1],
            amount:   amount,
            unit:     match[3],
        })
    }
    
    return operations
}

func (gtp *GrafanaTimeParser) applyOperation(t time.Time, op operation) (time.Time, error) {
    amount := op.amount
    if op.operator == "-" {
        amount = -amount
    }
    
    switch op.unit {
    case "s":
        return t.Add(time.Duration(amount) * time.Second), nil
    case "m":
        return t.Add(time.Duration(amount) * time.Minute), nil
    case "h":
        return t.Add(time.Duration(amount) * time.Hour), nil
    case "d":
        return t.AddDate(0, 0, amount), nil
    case "w":
        return t.AddDate(0, 0, amount*7), nil
    case "M":
        return t.AddDate(0, amount, 0), nil
    case "y":
        return t.AddDate(amount, 0, 0), nil
    default:
        return time.Time{}, fmt.Errorf("unknown unit: %s", op.unit)
    }
}

func (gtp *GrafanaTimeParser) roundTime(t time.Time, unit string) time.Time {
    switch unit {
    case "s":
        return t.Truncate(time.Second)
    case "m":
        return t.Truncate(time.Minute)
    case "h":
        return t.Truncate(time.Hour)
    case "d":
        return gtp.startOfDay(t)
    case "w":
        return gtp.startOfWeek(t)
    case "M":
        return gtp.startOfMonth(t)
    case "y":
        return gtp.startOfYear(t)
    default:
        return t
    }
}

func (gtp *GrafanaTimeParser) startOfDay(t time.Time) time.Time {
    return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

func (gtp *GrafanaTimeParser) startOfWeek(t time.Time) time.Time {
    weekday := int(t.Weekday())
    if weekday == 0 {
        weekday = 7
    }
    return gtp.startOfDay(t).AddDate(0, 0, 1-weekday)
}

func (gtp *GrafanaTimeParser) startOfMonth(t time.Time) time.Time {
    return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
}

func (gtp *GrafanaTimeParser) startOfYear(t time.Time) time.Time {
    return time.Date(t.Year(), 1, 1, 0, 0, 0, 0, t.Location())
}

func (gtp *GrafanaTimeParser) parseAbsoluteTime(timeStr string) (time.Time, error) {
    formats := []string{
        time.RFC3339,
        time.RFC3339Nano,
        "2006-01-02T15:04:05Z07:00",
        "2006-01-02T15:04:05",
        "2006-01-02 15:04:05",
        "2006-01-02",
    }
    
    for _, format := range formats {
        if t, err := time.ParseInLocation(format, timeStr, gtp.timezone); err == nil {
            return t, nil
        }
    }
    
    return time.Time{}, fmt.Errorf("unable to parse time: %s", timeStr)
}