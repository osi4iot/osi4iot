package certrenewer

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/kardianos/service"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	// "github.com/osi4iot/osi4iot/utils/osi4iot/paths"
)

const defaultIntervalHours = 12

// buildSvcConfig builds the service.Config dynamically so that Executable
// always points to the resolved absolute path of the running binary.
// Using a package-level var with os.Executable() at init time is not safe
// because the value is evaluated before the binary may have been moved to
// its final location. Calling this function right before service.New ensures
// the path is always correct.
func buildSvcConfig() (*service.Config, error) {
	exePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("could not determine executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return nil, fmt.Errorf("could not resolve executable symlinks: %w", err)
	}

	return &service.Config{
		Name:        "osi4iot-cert-renewer",
		DisplayName: "OSI4IOT Certificate Renewer",
		Description: "Automatically renews TLS certificates for the OSI4IOT platform.",
		Executable:  exePath,
		Arguments:   []string{"certs", "renewer", "daemon"},
	}, nil
}

type program struct {
	renewFn func() error
	quit    chan struct{}
}

func (p *program) Start(_ service.Service) error {
	p.quit = make(chan struct{})
	go p.run()
	return nil
}

func (p *program) Stop(_ service.Service) error {
	close(p.quit)
	return nil
}

func (p *program) run() {
	interval := defaultIntervalHours * time.Hour
	log.Printf("[cert-renewer] Started. Interval: %v", interval)
	runOnce(p.renewFn)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			runOnce(p.renewFn)
		case <-p.quit:
			log.Println("[cert-renewer] Stopped.")
			return
		}
	}
}

func runOnce(renewFn func() error) {
	log.Println("[cert-renewer] Renewing certificates...")
	if err := renewFn(); err != nil {
		log.Printf("[cert-renewer] Error: %v", err)
		return
	}
}

// RunDaemon is called by the hidden "certs renewer daemon" subcommand.
// It must configure the logger FIRST so that every subsequent log call,
// including any fatal errors, is captured in the log file and not lost
// to the systemd journal (which may be discarded in some configurations).
func RunDaemon(renewFn func(*log.Logger) error, domainName string) {
	// 1. Configure the logger before anything else.
	logPath := filepath.Join(logDir(domainName), "cert-renewer.log")
	fileLogger := log.New(os.Stderr, "", log.LstdFlags)
	if fw, err := newFileLogger(logPath); err == nil {
		fileLogger = log.New(fw, "", log.LstdFlags)
	} else {
		fileLogger.Printf("[cert-renewer] WARNING: could not open log file: %v", err)
	}

	// 2. Build the service config with the resolved executable path.
	cfg, err := buildSvcConfig()
	if err != nil {
		fileLogger.Fatalf("[cert-renewer] could not build service config: %v", err)
	}

	prg := &program{renewFn: func() error {
		return renewFn(fileLogger)
	}}
	s, err := service.New(prg, cfg)
	if err != nil {
		fileLogger.Fatalf("[cert-renewer] could not create service: %v", err)
	}
	if err := s.Run(); err != nil {
		fileLogger.Fatalf("[cert-renewer] service exited with error: %v", err)
	}
}

// InstallService registers the service with the OS init system.
// If the service is already installed it is a no-op, so calling it on every
// "create" and "init" is safe.
func InstallService(pd *pt.PlatformData) error {
	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return nil
	}

	workDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("could not determine working directory: %w", err)
	}

	if err := os.MkdirAll(logDir(pd.PlatformInfo.DomainName), 0755); err != nil {
		fmt.Printf("⚠️  Warning: could not create log directory: %v\n", err)
	}

	if _, err := os.Stat(serviceFilePath()); err != nil {
		cfg, err := buildSvcConfig()
		if err != nil {
			return fmt.Errorf("could not build service config: %w", err)
		}
		prg := &program{}
		s, err := service.New(prg, cfg)
		if err != nil {
			return fmt.Errorf("could not create service object: %w", err)
		}
		if err := s.Install(); err != nil {
			return fmt.Errorf("could not install service: %w", err)
		}
		fmt.Println(utils.StyleOKMsg.Render("Cert-renewer service installed (will start automatically on boot)"))
	}

	if err := patchServiceFileWorkingDir(workDir); err != nil {
		return fmt.Errorf("could not patch service file: %w", err)
	}

	if err := crypto.EnsureRootPassphraseFile(); err != nil {
		fmt.Printf("⚠️  Warning: could not create root passphrase file: %v\n", err)
	}

	return nil
}

func patchServiceFileWorkingDir(workDir string) error {
	path := serviceFilePath()

	content, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("could not read service file: %w", err)
	}
	if strings.Contains(string(content), "WorkingDirectory=") {
		return nil // ya está, no hacer nada
	}

	cmd := exec.Command("sed", "-i",
		"/^ExecStart=/a WorkingDirectory="+workDir,
		path,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("sed failed: %v — %s", err, out)
	}

	// Recarga systemd
	cmd = exec.Command("systemctl", "daemon-reload")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl daemon-reload failed: %v — %s", err, out)
	}

	return nil
}

// UninstallService removes the service registration from the OS init system.
func UninstallService() error {
	cfg, err := buildSvcConfig()
	if err != nil {
		return fmt.Errorf("could not build service config: %w", err)
	}
	prg := &program{}
	s, err := service.New(prg, cfg)
	if err != nil {
		return fmt.Errorf("could not create service object: %w", err)
	}
	_ = s.Stop()
	if err := s.Uninstall(); err != nil {
		return fmt.Errorf("could not uninstall service: %w", err)
	}
	fmt.Println(utils.StyleOKMsg.Render("Cert-renewer service uninstalled"))
	return nil
}

// Start starts the already-installed service.
func Start(pd *pt.PlatformData) error {
	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return nil
	}
	cfg, err := buildSvcConfig()
	if err != nil {
		return fmt.Errorf("could not build service config: %w", err)
	}
	prg := &program{}
	s, err := service.New(prg, cfg)
	if err != nil {
		return fmt.Errorf("could not create service object: %w", err)
	}
	if err := s.Start(); err != nil {
		return fmt.Errorf("could not start service: %w", err)
	}
	fmt.Println(utils.StyleOKMsg.Render("Cert-renewer service started"))
	return nil
}

// Stop stops the running service.
func Stop() error {
	cfg, err := buildSvcConfig()
	if err != nil {
		return fmt.Errorf("could not build service config: %w", err)
	}
	prg := &program{}
	s, err := service.New(prg, cfg)
	if err != nil {
		return fmt.Errorf("could not create service object: %w", err)
	}
	if err := s.Stop(); err != nil {
		return nil // not running is not a critical error
	}
	fmt.Println(utils.StyleOKMsg.Render("Cert-renewer service stopped"))
	return nil
}

// Status prints the current service status to stdout.
func Status() {
	cfg, err := buildSvcConfig()
	if err != nil {
		fmt.Printf("cert-renewer: could not build service config: %v\n", err)
		return
	}
	prg := &program{}
	s, err := service.New(prg, cfg)
	if err != nil {
		fmt.Printf("cert-renewer: error querying status: %v\n", err)
		return
	}
	status, err := s.Status()
	if err != nil {
		fmt.Printf("cert-renewer: not installed ⛔ (%v)\n", err)
		return
	}
	switch status {
	case service.StatusRunning:
		fmt.Println("cert-renewer: running ✅")
	case service.StatusStopped:
		fmt.Println("cert-renewer: stopped ⛔")
	default:
		fmt.Println("cert-renewer: unknown status ⚠️")
	}
}

// serviceFilePath returns the path where kardianos/service writes the systemd
// unit file on Linux. Used to detect whether the service is already installed.
func serviceFilePath() string {
	return "/etc/systemd/system/osi4iot-cert-renewer.service"
}
