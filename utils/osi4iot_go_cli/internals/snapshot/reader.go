package snapshot

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Reader opens an osi4iot_snapshot.zip for reading. Always Close.
//
// Open validates the manifest before returning, so a caller that gets a
// Reader back has already been told whether the bundle is the right
// shape. What it has NOT been told is whether the bytes are intact;
// that is Verify, which reads the whole archive and is the caller's
// choice to make.
type Reader struct {
	path   string
	zr     *zip.ReadCloser
	man    *Manifest
	byPath map[string]*zip.File
}

// Open reads and validates the manifest of the bundle at path.
func Open(path string) (*Reader, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, fmt.Errorf("error opening %s: %w", path, err)
	}

	r := &Reader{
		path:   path,
		zr:     zr,
		byPath: make(map[string]*zip.File, len(zr.File)),
	}
	for _, file := range zr.File {
		r.byPath[file.Name] = file
	}

	manifest, err := r.readWholeFile(ManifestPath)
	if err != nil {
		zr.Close()
		return nil, fmt.Errorf("%s has no %s, so it is not an osi4iot snapshot", path, ManifestPath)
	}
	r.man, err = decodeManifest(manifest)
	if err != nil {
		zr.Close()
		return nil, err
	}
	if err := r.man.Validate(); err != nil {
		zr.Close()
		return nil, err
	}

	// The manifest is an index, so an entry it lists but the archive
	// does not hold is a broken bundle — and finding that out now beats
	// finding it out with half the objects already uploaded.
	for _, target := range r.man.IncludedTargets() {
		for _, entry := range r.man.Target(target).Entries {
			if _, ok := r.byPath[entry.ZipPath]; !ok {
				zr.Close()
				return nil, fmt.Errorf("the manifest lists %s but the archive does not contain it",
					entry.ZipPath)
			}
		}
	}

	return r, nil
}

func (r *Reader) Close() error { return r.zr.Close() }

// Manifest returns the validated manifest.
func (r *Reader) Manifest() *Manifest { return r.man }

// StateFile returns the state file exactly as it was stored: still
// encrypted, unless Manifest().StateEncrypted is false.
//
// Decrypting it is the caller's job, because the passphrase prompting,
// the retry on an older passphrase and the re-encryption under this
// machine's key all live in the CLI already. See cmd/state.go's
// decryptStateBackup and installStateFile, which this is meant to feed.
func (r *Reader) StateFile() ([]byte, error) {
	if !r.man.Has(TargetState) {
		return nil, fmt.Errorf("this snapshot does not include the state file")
	}
	return r.readWholeFile(StatePath)
}

// Nodes returns the editable machine description, and whether the
// bundle had one at all.
//
// A bundle written by this package always does, but one that has been
// round-tripped through a file manager may not, and that is worth
// telling the operator plainly rather than failing.
func (r *Reader) Nodes() (*NodesOverlay, bool, error) {
	data, err := r.readWholeFile(NodesPath)
	if err != nil {
		return nil, false, nil
	}
	overlay, err := decodeNodes(data)
	if err != nil {
		return nil, true, err
	}
	return overlay, true, nil
}

// Readme returns the bundle's README, if it has one.
func (r *Reader) Readme() (string, bool) {
	data, err := r.readWholeFile(ReadmePath)
	if err != nil {
		return "", false
	}
	return string(data), true
}

// Entries lists the objects stored for a target, in manifest order.
func (r *Reader) Entries(target Target) []Entry {
	tm := r.man.Target(target)
	if tm == nil {
		return nil
	}
	return tm.Entries
}

// OpenEntry streams one object out of the archive, verifying its
// checksum as it goes: the returned reader fails at EOF if the bytes do
// not match what the manifest recorded.
//
// Verifying on the way out rather than up front is what lets a restore
// upload a 40 GiB base backup without reading the archive twice. The
// cost is that the error arrives at the END of the object, so a caller
// uploading straight from this reader must treat a failed Read as a
// failed upload and not as a finished one.
func (r *Reader) OpenEntry(entry Entry) (io.ReadCloser, error) {
	file, ok := r.byPath[entry.ZipPath]
	if !ok {
		return nil, fmt.Errorf("%s is not in this snapshot", entry.ZipPath)
	}
	body, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("error reading %s: %w", entry.ZipPath, err)
	}
	return &verifyingReader{
		body:   body,
		hasher: sha256.New(),
		want:   entry.SHA256,
		name:   entry.ObjectKey,
		size:   entry.Size,
	}, nil
}

// ReadEntry reads one object into memory, verified.
//
// For the small things: the NATS runs, a wal-g metadata file. A Patroni
// base backup belongs in OpenEntry or ExtractEntry.
func (r *Reader) ReadEntry(entry Entry) ([]byte, error) {
	body, err := r.OpenEntry(entry)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	return io.ReadAll(body)
}

// ExtractEntry writes one object to a file under destDir and returns
// its path, verified.
//
// Here for the callers that need a seekable source: the AWS SDK retries
// a failed PutObject by rewinding the body, which a zip entry cannot
// do, so anything large enough to matter gets spooled to disk first.
func (r *Reader) ExtractEntry(entry Entry, destDir string) (string, error) {
	// The entry paths come out of the manifest, which Validate has
	// already confined to a target directory, but this writes to a real
	// filesystem so it checks again rather than trusting that.
	clean := filepath.Clean(filepath.FromSlash(entry.ZipPath))
	if filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("refusing to extract %q, which points outside the snapshot", entry.ZipPath)
	}
	destPath := filepath.Join(destDir, clean)

	if err := os.MkdirAll(filepath.Dir(destPath), 0700); err != nil {
		return "", fmt.Errorf("error creating %s: %w", filepath.Dir(destPath), err)
	}

	body, err := r.OpenEntry(entry)
	if err != nil {
		return "", err
	}
	defer body.Close()

	file, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", fmt.Errorf("error creating %s: %w", destPath, err)
	}
	defer file.Close()

	if _, err := io.Copy(file, body); err != nil {
		os.Remove(destPath)
		return "", fmt.Errorf("error extracting %s: %w", entry.ObjectKey, err)
	}
	// Close the verifying reader explicitly: with io.Copy the checksum
	// check has already run at EOF, but a short archive would surface
	// only here.
	if err := body.Close(); err != nil {
		os.Remove(destPath)
		return "", err
	}
	return destPath, nil
}

// Verify reads every object in the bundle and checks it against the
// manifest.
//
// Worth offering, and worth NOT doing by default: on a bundle carrying
// two Postgres clusters this reads tens of gigabytes. The place for it
// is an explicit `--verify`, or the moment before an operator commits
// to a migration that will take the old platform down.
//
// progress, if given, is called before each entry.
func (r *Reader) Verify(progress func(target Target, entry Entry)) error {
	for _, target := range r.man.IncludedTargets() {
		for _, entry := range r.man.Target(target).Entries {
			if progress != nil {
				progress(target, entry)
			}
			body, err := r.OpenEntry(entry)
			if err != nil {
				return err
			}
			if _, err := io.Copy(io.Discard, body); err != nil {
				body.Close()
				return err
			}
			if err := body.Close(); err != nil {
				return err
			}
		}
	}
	return nil
}

// readWholeFile reads one archive member by name, without checksum
// verification — used for the manifest itself, which is what the
// checksums are recorded in.
func (r *Reader) readWholeFile(name string) ([]byte, error) {
	file, ok := r.byPath[name]
	if !ok {
		return nil, fmt.Errorf("%s is not in this snapshot", name)
	}
	body, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("error reading %s: %w", name, err)
	}
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("error reading %s: %w", name, err)
	}
	return data, nil
}

// verifyingReader passes bytes through while hashing them, and reports
// a mismatch at EOF and again on Close.
type verifyingReader struct {
	body     io.ReadCloser
	hasher   hash.Hash
	want     string
	name     string
	size     int64
	read     int64
	checked  bool
	checkErr error
}

func (v *verifyingReader) Read(p []byte) (int, error) {
	n, err := v.body.Read(p)
	if n > 0 {
		v.hasher.Write(p[:n])
		v.read += int64(n)
	}
	if err == io.EOF {
		if checkErr := v.check(); checkErr != nil {
			return n, checkErr
		}
	}
	return n, err
}

func (v *verifyingReader) Close() error {
	// A caller that stopped early gets no verdict: it never asked for
	// the whole object, so there is nothing to have failed.
	err := v.check()
	if closeErr := v.body.Close(); err == nil {
		err = closeErr
	}
	return err
}

func (v *verifyingReader) check() error {
	if v.checked {
		return v.checkErr
	}
	if v.read < v.size {
		return nil
	}
	v.checked = true

	if v.size != 0 && v.read != v.size {
		v.checkErr = fmt.Errorf("%s is %d bytes in the manifest but %d were read from the snapshot",
			v.name, v.size, v.read)
		return v.checkErr
	}
	got := hex.EncodeToString(v.hasher.Sum(nil))
	if !strings.EqualFold(got, v.want) {
		v.checkErr = fmt.Errorf("%s does not match its checksum: the snapshot is damaged", v.name)
		return v.checkErr
	}
	return nil
}