package snapshot

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"time"
)

// Writer builds an osi4iot_snapshot.zip.
//
// The intended shape at the call site:
//
//	w, err := snapshot.Create(output, snapshot.NewManifest(version, pd, encrypted))
//	defer w.Abort()                      // no-op once Close has run
//	w.AddStateFile(encodedStateFile)
//	w.AddNodes(snapshot.ExtractNodes(pd))
//	for _, obj := range objects {
//	    body, _ := s3.Get(obj.Key)
//	    w.AddObject(target, relKey, obj.Size, obj.ModTime, body)
//	    body.Close()
//	}
//	w.Close()
//
// Abort before Close removes the partial file. A half-written snapshot
// left on disk is worse than none: it looks like a backup.
type Writer struct {
	path   string
	file   *os.File
	zw     *zip.Writer
	man    *Manifest
	closed bool
}

// Create opens path for writing and takes ownership of man, which is
// written into the archive by Close.
func Create(path string, man *Manifest) (*Writer, error) {
	if man == nil {
		return nil, fmt.Errorf("a snapshot needs a manifest")
	}

	// O_EXCL: overwriting an existing snapshot is not something to do
	// as a side effect. The caller decides, and removes it first.
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, fmt.Errorf("error creating %s: %w", path, err)
	}

	return &Writer{
		path: path,
		file: file,
		zw:   zip.NewWriter(file),
		man:  man,
	}, nil
}

// Manifest exposes the manifest being built, for callers that need to
// record catalogue details a target carries — the wal-g chain, the NATS
// run name — alongside the objects themselves.
func (w *Writer) Manifest() *Manifest { return w.man }

// AddStateFile stores the state file exactly as it sits on disk.
//
// Encrypted, byte for byte, no re-encryption: the bundle's secrecy then
// reduces to the passphrase the operator already types, with no second
// key to manage and no way for this code to have quietly changed the
// contents. It is the same reasoning as docker.BackupStateFile's.
func (w *Writer) AddStateFile(encoded []byte) error {
	if len(encoded) == 0 {
		return fmt.Errorf("the state file is empty")
	}

	sum := sha256.Sum256(encoded)
	if err := w.addSmallFile(StatePath, encoded); err != nil {
		return err
	}

	tm := w.man.EnsureTarget(TargetState)
	tm.Entries = append(tm.Entries, Entry{
		ZipPath:   StatePath,
		ObjectKey: path.Base(StatePath),
		Size:      int64(len(encoded)),
		SHA256:    hex.EncodeToString(sum[:]),
		ModTime:   time.Now().UTC(),
	})
	tm.Bytes += int64(len(encoded))
	return nil
}

// AddNodes stores the editable machine description. Always paired with
// AddStateFile; a bundle with one and not the other is not useful.
func (w *Writer) AddNodes(overlay NodesOverlay) error {
	data, err := overlay.encode()
	if err != nil {
		return err
	}
	return w.addSmallFile(NodesPath, data)
}

// AddObject copies one stored object into the archive under target,
// streaming it: nothing here holds a wal-g base backup in memory.
//
// objectKey is the key RELATIVE to the target's prefix in the source
// bucket, which is what makes the bundle restorable under a different
// prefix on the far side. size and modTime are the object's, as
// reported by the store, and may be zero when unknown — the entry
// records the bytes actually copied either way.
func (w *Writer) AddObject(target Target, objectKey string, size int64, modTime time.Time, r io.Reader) (Entry, error) {
	if w.closed {
		return Entry{}, fmt.Errorf("the snapshot is already closed")
	}
	if target == TargetState {
		return Entry{}, fmt.Errorf("the state file goes in through AddStateFile, not AddObject")
	}
	if !target.Valid() {
		return Entry{}, fmt.Errorf("unknown target %q", target)
	}

	zipPath, err := zipPathFor(target, objectKey)
	if err != nil {
		return Entry{}, err
	}

	header := &zip.FileHeader{
		Name: zipPath,
		// Store, not Deflate: wal-g output is already compressed and,
		// with WALG_LIBSODIUM_KEY set, encrypted; the NATS runs are
		// gzipped. Deflating them again spends CPU on entropy.
		Method: zip.Store,
	}
	if !modTime.IsZero() {
		header.Modified = modTime.UTC()
	}
	if size > 0 {
		header.UncompressedSize64 = uint64(size)
	}

	entryWriter, err := w.zw.CreateHeader(header)
	if err != nil {
		return Entry{}, fmt.Errorf("error adding %s to the snapshot: %w", zipPath, err)
	}

	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(entryWriter, hasher), r)
	if err != nil {
		return Entry{}, fmt.Errorf("error copying %s into the snapshot: %w", objectKey, err)
	}
	if size > 0 && written != size {
		// The store said one thing and delivered another. Better to
		// stop here than to ship a truncated base backup that only
		// fails when someone tries to restore it.
		return Entry{}, fmt.Errorf("%s is %d bytes in the bucket but %d were read",
			objectKey, size, written)
	}

	entry := Entry{
		ZipPath:   zipPath,
		ObjectKey: strings.TrimPrefix(zipPath, target.Dir()),
		Size:      written,
		SHA256:    hex.EncodeToString(hasher.Sum(nil)),
		ModTime:   header.Modified,
	}

	tm := w.man.EnsureTarget(target)
	tm.Entries = append(tm.Entries, entry)
	tm.Bytes += written
	return entry, nil
}

// Close writes the README and the manifest, flushes the archive and
// closes the file. The manifest goes in last because it describes
// everything before it.
func (w *Writer) Close() error {
	if w.closed {
		return nil
	}

	if err := w.addSmallFile(ReadmePath, []byte(readmeText(w.man))); err != nil {
		return err
	}

	manifest, err := w.man.encode()
	if err != nil {
		return err
	}
	if err := w.addSmallFile(ManifestPath, manifest); err != nil {
		return err
	}

	w.closed = true
	if err := w.zw.Close(); err != nil {
		w.file.Close()
		return fmt.Errorf("error finishing the snapshot: %w", err)
	}
	// Sync before reporting success: this file is the whole point of
	// the command, and "written" should mean written.
	if err := w.file.Sync(); err != nil {
		w.file.Close()
		return fmt.Errorf("error flushing %s: %w", w.path, err)
	}
	if err := w.file.Close(); err != nil {
		return fmt.Errorf("error closing %s: %w", w.path, err)
	}
	return nil
}

// Abort throws away a snapshot that was never finished. Safe to defer
// unconditionally: it does nothing once Close has succeeded.
func (w *Writer) Abort() {
	if w.closed {
		return
	}
	w.closed = true
	w.zw.Close()
	w.file.Close()
	os.Remove(w.path)
}

// addSmallFile writes one deflated entry from memory.
func (w *Writer) addSmallFile(name string, data []byte) error {
	if w.closed {
		return fmt.Errorf("the snapshot is already closed")
	}

	header := &zip.FileHeader{
		Name:     name,
		Method:   zip.Deflate,
		Modified: time.Now().UTC(),
	}
	entryWriter, err := w.zw.CreateHeader(header)
	if err != nil {
		return fmt.Errorf("error adding %s to the snapshot: %w", name, err)
	}
	if _, err := entryWriter.Write(data); err != nil {
		return fmt.Errorf("error writing %s into the snapshot: %w", name, err)
	}
	return nil
}

// zipPathFor builds an entry path from an object key, refusing anything
// that would escape the target's directory.
//
// The keys come from an object store rather than from a filesystem, so
// ".." in one is already odd; letting it through would mean a malicious
// or corrupted bucket could place files anywhere the extraction runs.
func zipPathFor(target Target, objectKey string) (string, error) {
	key := strings.ReplaceAll(objectKey, "\\", "/")
	key = strings.TrimPrefix(path.Clean("/"+key), "/")

	if key == "" || key == "." {
		return "", fmt.Errorf("empty object key for target %s", target)
	}
	return target.Dir() + key, nil
}

// readmeText is what someone who unzips the bundle to look around
// reads. It exists because that person's next move — editing
// nodes.json, or hunting for a state file they can open — is one this
// format has an opinion about.
func readmeText(m *Manifest) string {
	var b strings.Builder

	b.WriteString("osi4iot platform snapshot\n")
	b.WriteString("=========================\n\n")
	b.WriteString(m.Describe())
	b.WriteString("\n")
	b.WriteString("To stand this platform up on other machines:\n\n")
	b.WriteString("  1. Edit state/nodes.json with the addresses and roles of the new machines.\n")
	b.WriteString("     Leave the rest of the zip alone.\n")
	b.WriteString("  2. Re-zip it if your editor unpacked it, then run:\n\n")
	b.WriteString("       osi4iot init --snapshot-file osi4iot_snapshot.zip\n\n")
	b.WriteString("  3. You will be asked for the passphrase this platform's state file was\n")
	b.WriteString("     encrypted with. Without it nothing in state/osi4iot_state.json can be\n")
	b.WriteString("     read, and the Patroni backups in this zip cannot be decrypted either:\n")
	b.WriteString("     their key lives inside that file.\n\n")
	b.WriteString("state/osi4iot_state.json is ENCRYPTED and is not meant to be edited by hand.\n")
	b.WriteString("The directories alongside it hold the database and stream backups, in the\n")
	b.WriteString("form their own tools wrote them; they are of no use outside this bundle.\n")

	return b.String()
}