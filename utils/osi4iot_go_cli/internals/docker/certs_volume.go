package docker

import (
	"archive/tar"
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// This file gives the CLI a way to read (and, when system_manager is
// down, write) the certificate material system_manager keeps in its
// volume WITHOUT going through NATS.
//
// It exists because the NATS path has a hole exactly where it matters
// most: during `create`, and during every `init`/`run` after a `stop` or
// `delete`, neither NATS nor system_manager is running — yet that is
// precisely when createSwarmServices is about to write
// iot_platform_cert/iot_platform_key from the local state file. If
// system_manager has renewed since the CLI last looked, that file is
// stale, and the platform comes back up serving an older certificate
// than the one sitting in the volume. Nothing downstream notices: the
// renewer reads the volume, sees weeks left, and correctly does
// nothing.
//
// The volume outlives the services, and the Docker API can read a file
// out of one without running anything: create a container with the
// volume mounted, copy the file out, remove the container. The
// container is never STARTED, so no entrypoint runs and nothing has to
// be healthy.
//
// Everything here stays encrypted — this package handles the blob, never
// the certificates. Decryption happens in SyncCertsFromSystemManager.

const (
	// certsVolumeName is what volumes.GenerateVolumes registers under
	// the "system_manager-data" key, and what services/system_manager.go
	// mounts at /data/certrenewer.
	certsVolumeName = "system_manager-data"
	// certsVolumeMount is where this file mounts that volume inside the
	// throwaway container.
	certsVolumeMount = "/data"
	// certsFileInVolume is system_manager's certstore.File, relative to
	// the volume root.
	certsFileInVolume = "certrenewer/domain_certs.enc"
)

// ErrNoStoredCerts means there is nothing to read: no system_manager
// volume on any node, or a volume with no certificate file in it yet.
// It is the expected result on a brand-new platform, so callers treat it
// as "the CLI is the authority here" rather than as a failure.
var ErrNoStoredCerts = errors.New("no certificates stored in the system_manager volume")

// ReadCertsBlobFromVolume returns the encrypted certificate blob
// system_manager holds, read straight off its volume.
//
// It looks on every node the CLI has a client for, not just the manager
// it would normally talk to: the volume lives wherever Swarm last placed
// system_manager (node.role==manager, one replica), which on a
// multi-manager cluster is not necessarily the first manager in the map.
func ReadCertsBlobFromVolume(pd *pt.PlatformData) (string, error) {
	var lastErr error
	for nodeIP, dc := range pt.DCMap {
		if dc == nil || dc.Cli == nil {
			continue // SetDockerClientsMap stores nil for unreachable nodes
		}

		hasVolume, err := hasCertsVolume(dc)
		if err != nil {
			lastErr = fmt.Errorf("node '%s': %w", nodeIP, err)
			continue
		}
		if !hasVolume {
			continue
		}

		blob, err := readFileFromVolume(dc, pd, certsFileInVolume)
		if errors.Is(err, ErrNoStoredCerts) {
			continue // volume is there but hasn't been written to yet
		}
		if err != nil {
			lastErr = fmt.Errorf("node '%s': %w", nodeIP, err)
			continue
		}
		return blob, nil
	}

	if lastErr != nil {
		return "", lastErr
	}
	return "", ErrNoStoredCerts
}

// WriteCertsBlobToVolume puts blob into system_manager's volume.
//
// Only call this when system_manager is NOT running: it is the offline
// counterpart to the export path, for when the CLI had to renew locally
// because the platform was down and would otherwise leave the volume
// holding older material than the state file. With system_manager
// running there is no need for it — the service owns renewal — and no
// safety either, since nothing coordinates this write with its own.
//
// A missing volume is not an error: on a platform that has never
// deployed system_manager there is nothing to write to, and the
// system_manager_certs seed secret covers that case at deploy time.
func WriteCertsBlobToVolume(pd *pt.PlatformData, blob string) error {
	for nodeIP, dc := range pt.DCMap {
		if dc == nil || dc.Cli == nil {
			continue
		}
		hasVolume, err := hasCertsVolume(dc)
		if err != nil {
			return fmt.Errorf("node '%s': %w", nodeIP, err)
		}
		if !hasVolume {
			continue
		}
		if err := writeFileToVolume(dc, pd, certsFileInVolume, blob); err != nil {
			return fmt.Errorf("node '%s': %w", nodeIP, err)
		}
		return nil
	}
	return nil
}

// hasCertsVolume reports whether system_manager's volume exists on this
// node.
func hasCertsVolume(dc *pt.DockerClient) (bool, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	list, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{Filters: filterArgs})
	if err != nil {
		return false, fmt.Errorf("error listing volumes: %w", err)
	}
	for _, v := range list.Volumes {
		if v.Name == certsVolumeName {
			return true, nil
		}
	}
	return false, nil
}

// withVolumeContainer creates a container with the certs volume mounted
// at certsVolumeMount, hands it to fn, and removes it afterwards.
//
// The container is deliberately never started: CopyFromContainer and
// CopyToContainer both work on a created container, so nothing in the
// image executes and the image's entrypoint doesn't even have to be
// valid. It uses system_manager's own image purely because that one is
// guaranteed to be present on a node that has ever run the service.
func withVolumeContainer(dc *pt.DockerClient, pd *pt.PlatformData, fn func(id string) error) error {
	image := utils.GetServiceImage(pd, "system_manager", "ghcr.io/osi4iot/system_manager:1.0.0")

	created, err := dc.Cli.ContainerCreate(dc.Ctx,
		&container.Config{Image: image},
		&container.HostConfig{
			Mounts: []mount.Mount{{
				Type:   mount.TypeVolume,
				Source: certsVolumeName,
				Target: certsVolumeMount,
			}},
		}, nil, nil, "")
	if err != nil {
		// The image not being pulled on this node is the normal state
		// where system_manager has never run here. Report it as
		// "nothing stored" so the caller falls back to its own state
		// rather than aborting a deployment over it.
		if errdefs.IsNotFound(err) {
			return ErrNoStoredCerts
		}
		return fmt.Errorf("error creating helper container: %w", err)
	}
	defer func() {
		_ = dc.Cli.ContainerRemove(dc.Ctx, created.ID, container.RemoveOptions{Force: true})
	}()

	return fn(created.ID)
}

// readFileFromVolume copies one file out of the volume. Docker returns
// it as a tar stream with a single entry.
func readFileFromVolume(dc *pt.DockerClient, pd *pt.PlatformData, relPath string) (string, error) {
	var out string
	err := withVolumeContainer(dc, pd, func(id string) error {
		reader, _, err := dc.Cli.CopyFromContainer(dc.Ctx, id, certsVolumeMount+"/"+relPath)
		if err != nil {
			if errdefs.IsNotFound(err) {
				return ErrNoStoredCerts
			}
			return fmt.Errorf("error copying %s out of the volume: %w", relPath, err)
		}
		defer reader.Close()

		tr := tar.NewReader(reader)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				return ErrNoStoredCerts
			}
			if err != nil {
				return fmt.Errorf("error reading tar stream: %w", err)
			}
			if hdr.Typeflag != tar.TypeReg {
				continue
			}
			data, err := io.ReadAll(tr)
			if err != nil {
				return fmt.Errorf("error reading %s: %w", relPath, err)
			}
			out = strings.TrimSpace(string(data))
			return nil
		}
	})
	if err != nil {
		return "", err
	}
	if out == "" {
		return "", ErrNoStoredCerts
	}
	return out, nil
}

// writeFileToVolume is the mirror of readFileFromVolume: one file, as a
// single-entry tar stream, mode 0600 — the same permissions
// system_manager's certstore writes it with.
func writeFileToVolume(dc *pt.DockerClient, pd *pt.PlatformData, relPath, content string) error {
	return withVolumeContainer(dc, pd, func(id string) error {
		var buf bytes.Buffer
		tw := tar.NewWriter(&buf)
		if err := tw.WriteHeader(&tar.Header{
			Name: relPath,
			Mode: 0600,
			Size: int64(len(content)),
		}); err != nil {
			return fmt.Errorf("error writing tar header: %w", err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			return fmt.Errorf("error writing tar body: %w", err)
		}
		if err := tw.Close(); err != nil {
			return fmt.Errorf("error closing tar stream: %w", err)
		}

		if err := dc.Cli.CopyToContainer(dc.Ctx, id, certsVolumeMount, &buf, container.CopyToContainerOptions{}); err != nil {
			return fmt.Errorf("error copying %s into the volume: %w", relPath, err)
		}
		return nil
	})
}
