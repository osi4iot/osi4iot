package certrenewer

import (
    "bufio"
    "fmt"
    "io"
    "os"
    "time"
)

func ShowLogs(follow bool, lines int) {
    logPath := logFilePath()

    f, err := os.Open(logPath)
    if err != nil {
        fmt.Printf("Log not found at: %s\n", logPath)
        return
    }
    defer f.Close()

    fmt.Printf("→ %s\n\n", logPath)

    if follow {
		// Mode -f: shows the last N lines and continues to read
        printLastLines(logPath, lines)
        tailFollow(f)
    } else {
        // Normal mode: shows the last N lines
        printLastLines(logPath, lines)
    }
}

// printLastLines shows the last N lines of the file
func printLastLines(logPath string, n int) {
    f, err := os.Open(logPath)
    if err != nil {
        return
    }
    defer f.Close()

    var lines []string
    scanner := bufio.NewScanner(f)
    for scanner.Scan() {
        lines = append(lines, scanner.Text())
        if len(lines) > n {
            lines = lines[1:] // sliding window
        }
    }
    for _, l := range lines {
        fmt.Println(l)
    }
}

// tailFollow follows the file in real-time (like tail -f)
func tailFollow(f *os.File) {
    f.Seek(0, io.SeekEnd) // go to the end of the file
    reader := bufio.NewReader(f)
    fmt.Println("(Following logs, Ctrl+C to exit...)")
    for {
        line, err := reader.ReadString('\n')
        if len(line) > 0 {
            fmt.Print(line)
        }
        if err == io.EOF {
            time.Sleep(500 * time.Millisecond) // wait for new lines
            continue
        }
        if err != nil {
            break
        }
    }
}

func logFilePath() string {
    return logDir() + "/cert-renewer.log"
}