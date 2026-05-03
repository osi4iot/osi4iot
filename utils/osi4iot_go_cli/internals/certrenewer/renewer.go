package certrenewer

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"syscall"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/paths"
)

const defaultIntervalHours = 12

// RunDaemon is the main loop, called from "certs renewer --daemon"
func RunDaemon(renewFn func() error) {
	interval := defaultIntervalHours * time.Hour
	log.Printf("[cert-renewer] Iniciado. Intervalo: %v", interval)

	run(renewFn)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		run(renewFn)
	}
}

func run(renewFn func() error) {
	log.Println("[cert-renewer] Renewing certificates...")
	if err := renewFn(); err != nil {
		log.Printf("[cert-renewer] Error: %v", err)
		return
	}
	log.Println("[cert-renewer] Certificates renewed successfully.")
}

// Start launches the daemon in the background (called from run/init/create)
func Start(pd *pt.PlatformData) error {
	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return nil
	}

	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("could not get executable path: %w", err)
	}

	logPath := filepath.Join(logDir(), "cert-renewer.log")
	os.MkdirAll(logDir(), 0755)
	logF, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("error opening log: %w", err)
	}

	cmd := buildDaemonCmd(execPath, logF)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("error starting cert-renewer: %w", err)
	}

	if err := savePID(cmd.Process.Pid); err != nil {
		return err
	}

	okMessage := fmt.Sprintf("Cert-renewer started in background (PID %d)", cmd.Process.Pid)
	okMsg := utils.StyleOKMsg.Render(okMessage)
	fmt.Println(okMsg)

	go cmd.Wait()
	return nil
}

// Stop stop the daemon (called from stop/delete)
func Stop() error {
	pid, err := readPID()
	if err != nil {
		// It was not running, not a critical error
		return nil
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		removePID()
		return nil
	}

	if err := proc.Signal(os.Interrupt); err != nil {
		return fmt.Errorf("error stopping cert-renewer (PID %d): %w", pid, err)
	}

	removePID()
	okMessage := fmt.Sprintf("Cert-renewer stopped (PID %d)", pid)
	okMsg := utils.StyleOKMsg.Render(okMessage)
	fmt.Println(okMsg)
	return nil
}

func Status() {
	pid, err := readPID()
	if err != nil {
		fmt.Println("cert-renewer: stopped ⛔")
		return
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		removePID()
		fmt.Println("cert-renewer: stopped ⛔")
		return
	}

	// En Unix, kill -0 verifica si el proceso existe sin matarlo
	if err := proc.Signal(syscall.Signal(0)); err != nil {
		removePID() // PID file obsoleto, limpiar
		fmt.Printf("cert-renewer: stopped ⛔ (stale PID %d)\n", pid)
		return
	}

	fmt.Printf("cert-renewer: running ✅ (PID %d)\n", pid)
}

func logDir() string {
	return filepath.Join(paths.Osi4iotDir(), "logs")
}

func pidFile() string {
	return filepath.Join(paths.Osi4iotDir(), "cert-renewer.pid")
}

func savePID(pid int) error {
	os.MkdirAll(filepath.Dir(pidFile()), 0755)
	return os.WriteFile(pidFile(), []byte(fmt.Sprintf("%d", pid)), 0644)
}

func readPID() (int, error) {
	data, err := os.ReadFile(pidFile())
	if err != nil {
		return 0, err
	}
	var pid int
	_, err = fmt.Sscanf(string(data), "%d", &pid)
	return pid, err
}

func removePID() {
	os.Remove(pidFile())
}
