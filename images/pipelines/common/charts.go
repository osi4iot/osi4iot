package common

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// ChartsFromPayload are the charts of a message (payload "charts", which
// the AI Agent node fills with the charts of its answer). After a Function
// node they may come back as plain JSON objects: their fields are read
// with any capitalisation, and "data" as bytes, a base64 string or an
// array of numbers. The ones without an image are skipped.
func ChartsFromPayload(payload map[string]any) []ChatChart {
	if payload == nil {
		return nil
	}
	switch v := payload["charts"].(type) {
	case []ChatChart:
		out := make([]ChatChart, 0, len(v))
		for _, c := range v {
			if len(c.Data) > 0 {
				out = append(out, c)
			}
		}
		return out
	case []*ChatChart:
		out := make([]ChatChart, 0, len(v))
		for _, c := range v {
			if c != nil && len(c.Data) > 0 {
				out = append(out, *c)
			}
		}
		return out
	case []any:
		out := make([]ChatChart, 0, len(v))
		for _, item := range v {
			switch c := item.(type) {
			case ChatChart:
				if len(c.Data) > 0 {
					out = append(out, c)
				}
			case *ChatChart:
				if c != nil && len(c.Data) > 0 {
					out = append(out, *c)
				}
			case map[string]any:
				if chart, ok := chartFromMap(c); ok {
					out = append(out, chart)
				}
			}
		}
		return out
	}
	return nil
}

func chartFromMap(m map[string]any) (ChatChart, bool) {
	field := func(name string) any {
		for k, v := range m {
			if strings.EqualFold(k, name) {
				return v
			}
		}
		return nil
	}
	str := func(name string) string {
		s, _ := field(name).(string)
		return s
	}
	chart := ChatChart{ID: str("id"), Title: str("title"), MimeType: str("mimeType")}
	switch d := field("data").(type) {
	case []byte:
		chart.Data = d
	case string:
		data, err := base64.StdEncoding.DecodeString(d)
		if err != nil {
			return ChatChart{}, false
		}
		chart.Data = data
	case []any:
		data := make([]byte, 0, len(d))
		for _, n := range d {
			f, ok := n.(float64)
			if !ok {
				i, ok := n.(int64)
				if !ok {
					return ChatChart{}, false
				}
				f = float64(i)
			}
			if f < 0 || f > 255 {
				return ChatChart{}, false
			}
			data = append(data, byte(f))
		}
		chart.Data = data
	}
	if len(chart.Data) == 0 {
		return ChatChart{}, false
	}
	if chart.MimeType == "" {
		chart.MimeType = "image/png"
	}
	return chart, true
}

// ChartFileName is the file name of a chart (the index-th of a
// message): its id, if it is a plain one ("chart_….png"), else
// "chart_<index+1>", with the extension of its type.
func ChartFileName(c ChatChart, index int) string {
	name := c.ID
	if name == "" || len(name) > 64 || strings.Trim(name, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") != "" {
		name = fmt.Sprintf("chart_%d", index+1)
	}
	ext := ".png"
	switch strings.ToLower(c.MimeType) {
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	}
	return name + ext
}
