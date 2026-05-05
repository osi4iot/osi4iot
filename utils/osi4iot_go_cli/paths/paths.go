package paths

import (
    "os"
    "path/filepath"
)

// Osi4iotDir returns the primary .osi4iot directory for the current user.
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

// Osi4iotDirCandidates returns all plausible .osi4iot directories,
// ordered by priority: real user home first, then root.
// Useful when a file may have been created under a different user (e.g. sudo).
func Osi4iotDirCandidates() []string {
    seen := map[string]bool{}
    var candidates []string

    add := func(p string) {
        if p != "" && !seen[p] {
            seen[p] = true
            candidates = append(candidates, p)
        }
    }

    // 1. SUDO_USER: the real user behind a sudo invocation
    if sudoUser := os.Getenv("SUDO_USER"); sudoUser != "" {
        add(filepath.Join("/home", sudoUser, ".osi4iot"))
    }

    // 2. Current process home (may be /root if running as root)
    add(Osi4iotDir())

    // 3. /root as fallback
    add(filepath.Join("/root", ".osi4iot"))

    return candidates
}