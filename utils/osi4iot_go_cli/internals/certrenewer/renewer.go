package certrenewer

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/kardianos/service"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/paths"
)

const defaultIntervalHours = 12

var svcConfig = &service.Config{
	Name:        "osi4iot-cert-renewer",
	DisplayName: "OSI4IOT Certificate Renewer",
	Description: "Automatically renews TLS certificates for the OSI4IOT platform.",
	Arguments:   []string{"certs", "renewer", "daemon"},
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
	log.Println("[cert-renewer] Certificates renewed successfully.")
}

// RunDaemon is called by the hidden "certs renewer daemon" subcommand.
func RunDaemon(renewFn func() error) {
	prg := &program{renewFn: renewFn}
	s, err := service.New(prg, svcConfig)
	if err != nil {
		log.Fatalf("[cert-renewer] could not create service: %v", err)
	}
	logPath := filepath.Join(logDir(), "cert-renewer.log")
	if logger, err := newFileLogger(logPath); err == nil {
		log.SetOutput(logger)
	}
	if err := s.Run(); err != nil {
		log.Fatalf("[cert-renewer] service exited with error: %v", err)
	}
}

// InstallService registers the service with the OS init system.
// If the service is already installed it is a no-op, so calling it on every
// "create" and "init" is safe.
// Automatically escalates to sudo if not running as root.
func InstallService(pd *pt.PlatformData) error {
	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return nil
	}
	prg := &program{}
	s, err := service.New(prg, svcConfig)
	if err != nil {
		return fmt.Errorf("could not create service object: %w", err)
	}
	// If the service is already installed just skip — not an error.
	if _, err := os.Stat(serviceFilePath()); err == nil {
		return nil
	}
	if err := s.Install(); err != nil {
		return fmt.Errorf("could not install service: %w", err)
	}
	fmt.Println(utils.StyleOKMsg.Render("Cert-renewer service installed (will start automatically on boot)"))
	return nil
}

// UninstallService removes the service registration from the OS init system.
// Automatically escalates to sudo if not running as root.
func UninstallService() error {
	prg := &program{}
	s, err := service.New(prg, svcConfig)
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
// Escalates to sudo if the call fails due to permissions.
func Start(pd *pt.PlatformData) error {
	if pd.PlatformInfo.DomainCertsType != "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		return nil
	}
	prg := &program{}
	s, err := service.New(prg, svcConfig)
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
// Escalates to sudo if the call fails due to permissions.
func Stop() error {
	prg := &program{}
	s, err := service.New(prg, svcConfig)
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
	prg := &program{}
	s, err := service.New(prg, svcConfig)
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

func logDir() string {
	return filepath.Join(paths.Osi4iotDir(), "logs")
}

// serviceFilePath returns the path where kardianos/service writes the systemd
// unit file on Linux. Used to detect whether the service is already installed.
func serviceFilePath() string {
	return "/etc/systemd/system/" + svcConfig.Name + ".service"
}