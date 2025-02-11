package utils

import (
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"sync"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
)

func executeScriptOnLocalHost(script string, args ...string) (string, error) {
	cmdArgs := append([]string{"-s"}, args...)
	cmd := exec.Command("bash", cmdArgs...)

	var outputBuf bytes.Buffer
	var errorBuf bytes.Buffer
	cmd.Stdout = &outputBuf
	cmd.Stderr = &errorBuf

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("error obtaining stdin pipe: %w", err)
	}

	go func() {
		defer stdin.Close()
		_, _ = io.WriteString(stdin, script)
	}()

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("error executing local script: %w\nStderr: %s", err, errorBuf.String())
	}

	return outputBuf.String(), nil
}

type NodeScript struct {
	Node common.NodeData
	Script string
	Args []string
}

type ScriptResp struct {
	Response string
	Err      error
}

func RunScriptInNodes(platformData *common.PlatformData, nodeScripts []NodeScript) ([]string, error) {
	sshPrivKey, err := GetSshPrivKey(platformData)
	if err != nil {
		return []string{}, err
	}

	var wg sync.WaitGroup
	respChan := make(chan ScriptResp, len(nodeScripts))

	for _, nodeScript := range nodeScripts {
		wg.Add(1)
		ns := nodeScript
		go func() {
			defer wg.Done()
			nodeIP := ns.Node.NodeIP
			runningInLocalHost, err := IsHostIP(nodeIP)
			if err != nil {
				respErr :=  fmt.Errorf("error checking if host is localhost: %w", err)
				respChan <- ScriptResp{Err: respErr}
				return
			}
			if runningInLocalHost {
				resp, err := executeScriptOnLocalHost(ns.Script, ns.Args...)
				if err != nil {
					respErr := fmt.Errorf("node %s: %v", nodeIP, err)
					respChan <- ScriptResp{Err: respErr}
					return
				}
				respChan <- ScriptResp{Response: resp}
			} else {
				resp, err := executeScriptOnRemoteHost(ns.Node, sshPrivKey, ns.Script, ns.Args...)
				if err != nil {
					respErr := fmt.Errorf("node %s: %v", nodeIP, err)
					respChan <- ScriptResp{Err: respErr}
					return
				}
				respChan <- ScriptResp{Response: resp}
			}
		}()
	}
	wg.Wait()
	close(respChan)

	errs := []error{}
	responses := []string{}
	for scriptResp := range respChan {
		if scriptResp.Err != nil {
			errs = append(errs, scriptResp.Err)
			responses = append(responses, "")
		} else {
			responses = append(responses, scriptResp.Response)
		}
	}
	if len(errs) != 0 {
		return responses, fmt.Errorf("error executing scripts: %v", errs)
	}

	return responses, nil
}

