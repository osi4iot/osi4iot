package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type Logger struct {
	baseLogger  *zap.SugaredLogger // Sin línea
	errorLogger *zap.SugaredLogger // Con línea
}

func NewLogger() *Logger {
    cfg := zap.NewProductionConfig()
    cfg.EncoderConfig.TimeKey = ""
    cfg.EncoderConfig.CallerKey = "line"
    cfg.EncoderConfig.EncodeCaller = zapcore.ShortCallerEncoder
    cfg.DisableCaller = true

    base, _ := cfg.Build()
    baseSugar := base.Sugar()

    cfg.DisableCaller = false
    cfg.DisableStacktrace = true

    errorLog, _ := cfg.Build(zap.AddCallerSkip(1))
    errorSugar := errorLog.Sugar()

    return &Logger{
        baseLogger:  baseSugar,
        errorLogger: errorSugar,
    }
}

func (l *Logger) Info(args ...interface{}) {
	l.baseLogger.Info(args...)
}

func (l *Logger) Debug(args ...interface{}) {
	l.baseLogger.Debug(args...)
}

func (l *Logger) Warn(args ...interface{}) {
	l.baseLogger.Warn(args...)
}

func (l *Logger) Error(args ...interface{}) {
	l.errorLogger.Error(args...)
}

func (l *Logger) Fatal(args ...interface{}) {
	l.errorLogger.Fatal(args...)
}

func (l *Logger) Infof(template string, args ...interface{}) {
	l.baseLogger.Infof(template, args...)
}

func (l *Logger) Warnf(template string, args ...interface{}) {
	l.baseLogger.Warnf(template, args...)
}

func (l *Logger) Errorf(template string, args ...interface{}) {
	l.errorLogger.Errorf(template, args...)
}

func (l *Logger) Fatalf(template string, args ...interface{}) {
	l.errorLogger.Fatalf(template, args...)
}
