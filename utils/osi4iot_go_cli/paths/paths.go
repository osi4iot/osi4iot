package paths

import (
	"os"
	"path/filepath"
)

func Osi4iotDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		execPath, err := os.Executable()
		if err != nil {
			return "."
		}
		resolved, err := filepath.EvalSymlinks(execPath)
		if err != nil {
			resolved = execPath
		}
		return filepath.Dir(resolved)
	}
	return filepath.Join(home, ".osi4iot")
}