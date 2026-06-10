//go:build windows

package certrenewer

import (
    "os"
    "path/filepath"
)

func logDir(domainName string) string {
    // %ProgramData% → C:\ProgramData en la mayoría de sistemas Windows
    programData := os.Getenv("PROGRAMDATA")
    if programData == "" {
        programData = `C:\ProgramData`
    }
    return filepath.Join(programData, "osi4iot", domainName, "logs")
}