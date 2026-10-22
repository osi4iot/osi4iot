package llmagent

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"pipelines/logger"
)

// sdkLogger sends the SDK's log (logging.Logger) to pipelines' logger.
//
// Warnings and errors always go through. Info and debug only with
// debug on: at those levels the SDK logs every request, the system
// prompt, every tool result and the MCP servers' arguments (the
// knowledge base token among them).
type sdkLogger struct {
	log   *logger.Logger
	debug bool
}

func newSDKLogger(log *logger.Logger, debug bool) *sdkLogger {
	return &sdkLogger{log: log, debug: debug}
}

func (l *sdkLogger) Debug(_ context.Context, msg string, fields map[string]interface{}) {
	if l.debug {
		l.log.Infof("[agent-sdk debug] %s%s", msg, formatFields(fields))
	}
}

func (l *sdkLogger) Info(_ context.Context, msg string, fields map[string]interface{}) {
	if l.debug {
		l.log.Infof("[agent-sdk] %s%s", msg, formatFields(fields))
	}
}

func (l *sdkLogger) Warn(_ context.Context, msg string, fields map[string]interface{}) {
	l.log.Warnf("[agent-sdk] %s%s", msg, formatFields(fields))
}

func (l *sdkLogger) Error(_ context.Context, msg string, fields map[string]interface{}) {
	l.log.Errorf("[agent-sdk] %s%s", msg, formatFields(fields))
}

// formatFields renders the fields in key order, each value cut to 500
// characters (tool results can be long).
func formatFields(fields map[string]interface{}) string {
	if len(fields) == 0 {
		return ""
	}
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		v := fmt.Sprintf("%v", fields[k])
		if len(v) > 500 {
			v = v[:500] + "…"
		}
		fmt.Fprintf(&b, " %s=%s", k, v)
	}
	return b.String()
}
