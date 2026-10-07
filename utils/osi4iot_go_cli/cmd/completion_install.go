package cmd

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot completion install` puts the completion script where the
// shell finds it, instead of printing it like the other `completion`
// subcommands (which cobra provides).
//
// A program cannot change the shell that started it, so this does not
// enable completion in the current session: it makes every new one have
// it, and says how to load it in the current one.
//
// The script itself never needs regenerating when osi4iot changes: on
// every TAB it asks `osi4iot __complete` for the candidates.

const (
	completionBlockStart = "# >>> osi4iot completion >>>"
	completionBlockEnd   = "# <<< osi4iot completion <<<"
)

var cmdCompletionInstall = &cobra.Command{
	Use:       "install [bash|zsh|fish|powershell]",
	Short:     "Install autocompletion for osi4iot in your shell",
	ValidArgs: []string{"bash", "zsh", "fish", "powershell"},
	Args:      cobra.MatchAll(cobra.MaximumNArgs(1), cobra.OnlyValidArgs),
	Long: "Installs the autocompletion script so that every new terminal completes osi4iot " +
		"commands with TAB. The shell is detected from $SHELL (PowerShell on Windows) " +
		"unless given.\n\n" +
		"  bash        ~/.local/share/bash-completion/completions/osi4iot (needs the " +
		"bash-completion package, installed by default on Ubuntu)\n" +
		"  zsh         ~/.zsh/completions/_osi4iot, plus a marked block in ~/.zshrc\n" +
		"  fish        ~/.config/fish/completions/osi4iot.fish\n" +
		"  powershell  ~/.config/osi4iot/completion.ps1, plus a marked line in $PROFILE\n\n" +
		"Running it again is harmless: the script is rewritten and the startup files are " +
		"only edited once. The current terminal is not affected — the command prints how " +
		"to load the completion in it.",
	RunE: func(cmd *cobra.Command, args []string) error {
		shell := ""
		if len(args) == 1 {
			shell = args[0]
		}
		if shell == "" {
			shell = detectShell()
		}
		if shell == "" {
			return fmt.Errorf("could not detect your shell; name it: osi4iot completion install bash|zsh|fish|powershell")
		}
		return installCompletion(shell)
	},
}

// addCompletionInstall hangs `install` under the `completion` command
// cobra generates. Called at the end of the package's command setup:
// cobra only creates `completion` for a root that has subcommands.
func addCompletionInstall() {
	rootCmd.InitDefaultCompletionCmd()
	for _, c := range rootCmd.Commands() {
		if c.Name() == "completion" {
			c.AddCommand(cmdCompletionInstall)
		}
	}
}

// detectShell names the user's shell, or "" if it cannot tell.
func detectShell() string {
	if runtime.GOOS == "windows" {
		return "powershell"
	}
	switch filepath.Base(os.Getenv("SHELL")) {
	case "bash":
		return "bash"
	case "zsh":
		return "zsh"
	case "fish":
		return "fish"
	case "pwsh", "powershell":
		return "powershell"
	}
	return ""
}

// completionPlan says where a shell's completion goes.
type completionPlan struct {
	Script   string // file the script is written to
	RCFile   string // startup file to add RCBlock to ("" if none)
	RCBlock  string
	LoadNow  string // how to load it in the current session
	Requires string // what the shell needs for it to work ("" if nothing)
}

// planCompletion decides the paths for shell, under home. Pure, for tests.
func planCompletion(shell, home, xdgData, psProfile string) (completionPlan, error) {
	if xdgData == "" {
		xdgData = filepath.Join(home, ".local", "share")
	}
	switch shell {
	case "bash":
		script := filepath.Join(xdgData, "bash-completion", "completions", "osi4iot")
		return completionPlan{
			Script:   script,
			LoadNow:  "source " + script,
			Requires: "bash-completion",
		}, nil
	case "zsh":
		dir := filepath.Join(home, ".zsh", "completions")
		return completionPlan{
			Script: filepath.Join(dir, "_osi4iot"),
			RCFile: filepath.Join(home, ".zshrc"),
			RCBlock: completionBlockStart + "\n" +
				"fpath=(" + dir + " $fpath)\n" +
				"autoload -Uz compinit && compinit\n" +
				completionBlockEnd + "\n",
			LoadNow: "exec zsh",
		}, nil
	case "fish":
		script := filepath.Join(home, ".config", "fish", "completions", "osi4iot.fish")
		return completionPlan{Script: script, LoadNow: "source " + script}, nil
	case "powershell":
		script := filepath.Join(home, ".config", "osi4iot", "completion.ps1")
		if psProfile == "" {
			return completionPlan{}, fmt.Errorf("could not find your PowerShell profile ($PROFILE)")
		}
		return completionPlan{
			Script: script,
			RCFile: psProfile,
			RCBlock: completionBlockStart + "\n" +
				". \"" + script + "\"\n" +
				completionBlockEnd + "\n",
			LoadNow: ". \"" + script + "\"",
		}, nil
	}
	return completionPlan{}, fmt.Errorf("unsupported shell %q (bash, zsh, fish or powershell)", shell)
}

// appendBlockOnce adds block to file unless the file already has the
// block's start marker. Returns whether it added it.
func appendBlockOnce(file, block string) (bool, error) {
	current, err := os.ReadFile(file)
	if err != nil && !os.IsNotExist(err) {
		return false, err
	}
	if strings.Contains(string(current), completionBlockStart) {
		return false, nil
	}
	prefix := ""
	if len(current) > 0 && !bytes.HasSuffix(current, []byte("\n")) {
		prefix = "\n"
	}
	f, err := os.OpenFile(file, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return false, err
	}
	defer f.Close()
	if _, err := f.WriteString(prefix + "\n" + block); err != nil {
		return false, err
	}
	return true, nil
}

// targetHome is the home of the user the completion is for: the one who
// ran sudo, if the command runs under it.
func targetHome() (string, error) {
	if os.Geteuid() == 0 {
		if name := os.Getenv("SUDO_USER"); name != "" && name != "root" {
			if u, err := user.Lookup(name); err == nil {
				return u.HomeDir, nil
			}
		}
	}
	return os.UserHomeDir()
}

// powerShellProfile asks PowerShell where its profile is.
func powerShellProfile() string {
	for _, exe := range []string{"pwsh", "powershell"} {
		out, err := exec.Command(exe, "-NoProfile", "-Command", "$PROFILE").Output()
		if err == nil {
			if p := strings.TrimSpace(string(out)); p != "" {
				return p
			}
		}
	}
	return ""
}

// generateCompletion renders the script for shell, with descriptions.
func generateCompletion(shell string) ([]byte, error) {
	var buf bytes.Buffer
	var err error
	switch shell {
	case "bash":
		err = rootCmd.GenBashCompletionV2(&buf, true)
	case "zsh":
		err = rootCmd.GenZshCompletion(&buf)
	case "fish":
		err = rootCmd.GenFishCompletion(&buf, true)
	case "powershell":
		err = rootCmd.GenPowerShellCompletionWithDesc(&buf)
	}
	return buf.Bytes(), err
}

// mkdirAllOwned creates dir and its missing parents, giving each one it
// created to the invoking user when running under sudo.
func mkdirAllOwned(dir string) error {
	var created []string
	for d := dir; ; d = filepath.Dir(d) {
		if _, err := os.Stat(d); err == nil || d == filepath.Dir(d) {
			break
		}
		created = append(created, d)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	for _, d := range created {
		utils.ChownToInvokingUserQuietly(d)
	}
	return nil
}

func installCompletion(shell string) error {
	home, err := targetHome()
	if err != nil {
		return fmt.Errorf("error finding your home directory: %w", err)
	}
	profile := ""
	if shell == "powershell" {
		profile = powerShellProfile()
	}
	plan, err := planCompletion(shell, home, os.Getenv("XDG_DATA_HOME"), profile)
	if err != nil {
		return err
	}

	script, err := generateCompletion(shell)
	if err != nil {
		return fmt.Errorf("error generating the %s completion script: %w", shell, err)
	}
	if err := mkdirAllOwned(filepath.Dir(plan.Script)); err != nil {
		return fmt.Errorf("error creating %s: %w", filepath.Dir(plan.Script), err)
	}
	if err := os.WriteFile(plan.Script, script, 0644); err != nil {
		return fmt.Errorf("error writing %s: %w", plan.Script, err)
	}
	utils.ChownToInvokingUserQuietly(plan.Script)
	fmt.Printf("Installed the %s completion script: %s\n", shell, plan.Script)

	if plan.RCFile != "" {
		if err := mkdirAllOwned(filepath.Dir(plan.RCFile)); err != nil {
			return fmt.Errorf("error creating %s: %w", filepath.Dir(plan.RCFile), err)
		}
		added, err := appendBlockOnce(plan.RCFile, plan.RCBlock)
		if err != nil {
			return fmt.Errorf("error updating %s: %w", plan.RCFile, err)
		}
		utils.ChownToInvokingUserQuietly(plan.RCFile)
		if added {
			fmt.Printf("Added it to %s.\n", plan.RCFile)
		} else {
			fmt.Printf("%s already loads it.\n", plan.RCFile)
		}
	}

	if plan.Requires == "bash-completion" && !bashCompletionInstalled() {
		fmt.Println(utils.StyleWarningMsg.Render("The bash-completion package does not seem to be " +
			"installed; bash will not load the script without it. On Ubuntu/Debian: " +
			"sudo apt install bash-completion"))
	}

	fmt.Println("New terminals will complete osi4iot commands with TAB. In this one, run:")
	fmt.Println("  " + plan.LoadNow)
	return nil
}

func bashCompletionInstalled() bool {
	for _, f := range []string{
		"/usr/share/bash-completion/bash_completion",
		"/etc/bash_completion",
		"/usr/local/share/bash-completion/bash_completion",
		"/opt/homebrew/etc/profile.d/bash_completion.sh",
	} {
		if _, err := os.Stat(f); err == nil {
			return true
		}
	}
	return false
}
