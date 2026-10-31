package nodes

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Ingenimax/agent-sdk-go/pkg/skill"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"pipelines/logger"
)

// The skills of the AI agents (SKILL.md bundles, agent-sdk-go's
// pkg/skill), managed in admin_api and kept in the bucket:
//
//	platform_data/skills/<name>/SKILL.md (+ files)                    platform
//	org_data/org_<org>/group_<group>/skills/<name>/SKILL.md (+ files) group
//
// An AiAgent node chooses its skills in its "skills" setting:
// ["platform:<name>", "group:<name>"], the group being the digital
// twin's. None unless chosen.
//
// pipelines keeps no state: the files are copied to a cache on local disk
// (os.TempDir()/osi4iot_ai_skills, emptied when the process starts), one
// folder per version of a node's set of skills, because read_skill_resource
// reads them from disk. Before each prompt the node lists its skills in the
// bucket; when their files (keys, ETags) changed, it copies the new
// version and gives it to the agent without restarting its MCP servers.

const (
	aiAgentSkillsCacheDir     = "osi4iot_ai_skills"
	aiAgentSkillsSyncTimeout  = 60 * time.Second
	aiAgentSkillScopePlatform = "platform"
	aiAgentSkillScopeGroup    = "group"
)

// aiAgentSkillRef is a skill a node chooses: "platform:<name>" or
// "group:<name>".
type aiAgentSkillRef struct {
	scope string
	name  string
}

func (r aiAgentSkillRef) String() string { return r.scope + ":" + r.name }

// parseAiAgentSkills reads the node's "skills" setting. Entries that are
// not "platform:<name>" or "group:<name>" are returned apart, for the log.
func parseAiAgentSkills(settings map[string]interface{}) (refs []aiAgentSkillRef, invalid []string) {
	list, _ := settings["skills"].([]interface{})
	seen := map[aiAgentSkillRef]bool{}
	for _, v := range list {
		s, _ := v.(string)
		scope, name, ok := strings.Cut(strings.TrimSpace(s), ":")
		if !ok || (scope != aiAgentSkillScopePlatform && scope != aiAgentSkillScopeGroup) || !validSkillName(name) {
			invalid = append(invalid, fmt.Sprint(v))
			continue
		}
		ref := aiAgentSkillRef{scope: scope, name: name}
		if !seen[ref] {
			seen[ref] = true
			refs = append(refs, ref)
		}
	}
	return refs, invalid
}

// As admin_api checks them: kebab-case, at most 64 characters.
func validSkillName(name string) bool {
	if name == "" || len(name) > 64 || name[0] == '-' || name[len(name)-1] == '-' || strings.Contains(name, "--") {
		return false
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

func platformSkillsPrefix() string { return "platform_data/skills/" }

func groupSkillsPrefix(orgId, groupId int) string {
	return fmt.Sprintf("org_data/org_%d/group_%d/skills/", orgId, groupId)
}

// skillObject is a file of a chosen skill in the bucket.
type skillObject struct {
	ref  aiAgentSkillRef
	key  string
	rel  string // path inside the skill's folder
	etag string
	size int64
}

// listChosenSkills lists the files of the chosen skills that are in the
// bucket, and the version of that set: it changes when a file is added,
// changed or removed, or a skill appears or goes.
func listChosenSkills(ctx context.Context, client *s3.Client, bucket string, orgId, groupId int, refs []aiAgentSkillRef) ([]skillObject, string, error) {
	chosen := map[aiAgentSkillRef]bool{}
	prefixes := map[string]string{} // scope -> prefix, for the scopes chosen
	for _, r := range refs {
		chosen[r] = true
		if r.scope == aiAgentSkillScopePlatform {
			prefixes[r.scope] = platformSkillsPrefix()
		} else {
			prefixes[r.scope] = groupSkillsPrefix(orgId, groupId)
		}
	}

	var objects []skillObject
	for scope, prefix := range prefixes {
		paginator := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
			Prefix: aws.String(prefix),
		})
		for paginator.HasMorePages() {
			page, err := paginator.NextPage(ctx)
			if err != nil {
				return nil, "", fmt.Errorf("listing s3://%s/%s: %w", bucket, prefix, err)
			}
			for _, obj := range page.Contents {
				key := aws.ToString(obj.Key)
				name, rel, ok := strings.Cut(strings.TrimPrefix(key, prefix), "/")
				ref := aiAgentSkillRef{scope: scope, name: name}
				if !ok || rel == "" || !chosen[ref] {
					continue
				}
				objects = append(objects, skillObject{
					ref: ref, key: key, rel: rel,
					etag: aws.ToString(obj.ETag), size: aws.ToInt64(obj.Size),
				})
			}
		}
	}

	sort.Slice(objects, func(i, j int) bool { return objects[i].key < objects[j].key })
	h := sha1.New()
	for _, o := range objects {
		fmt.Fprintf(h, "%s\x00%s\x00%d\n", o.key, o.etag, o.size)
	}
	if len(objects) == 0 {
		return nil, "", nil
	}
	return objects, hex.EncodeToString(h.Sum(nil)), nil
}

var skillsCacheOnce sync.Once

// skillsCacheRoot is emptied once per process: what an earlier process
// left there is not trusted.
func skillsCacheRoot() string {
	root := filepath.Join(os.TempDir(), aiAgentSkillsCacheDir)
	skillsCacheOnce.Do(func() { _ = os.RemoveAll(root) })
	return root
}

// syncSkills copies a version of the chosen skills to the cache and
// returns its folder (<root>/<version>/<scope>/<name>/...). A version
// already there (another node with the same skills) is reused. The copy is
// made in a temporary folder and renamed, so a folder seen is complete.
func syncSkills(ctx context.Context, client *s3.Client, bucket, version string, objects []skillObject) (string, error) {
	root := skillsCacheRoot()
	dir := filepath.Join(root, version)
	if _, err := os.Stat(dir); err == nil {
		return dir, nil
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	tmp, err := os.MkdirTemp(root, "tmp-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp) // nothing left after the rename

	for _, o := range objects {
		// Checked in admin_api; checked again, since the bucket can be
		// written by other means: a key must not write outside the folder.
		rel := filepath.FromSlash(o.rel)
		if !filepath.IsLocal(rel) {
			return "", fmt.Errorf("skill %s: invalid file path %q", o.ref, o.rel)
		}
		dst := filepath.Join(tmp, o.ref.scope, o.ref.name, rel)
		if err := downloadSkillFile(ctx, client, bucket, o.key, dst); err != nil {
			return "", fmt.Errorf("skill %s: %w", o.ref, err)
		}
	}
	if err := os.Rename(tmp, dir); err != nil {
		if _, statErr := os.Stat(dir); statErr == nil {
			return dir, nil // another node copied the same version meanwhile
		}
		return "", err
	}
	return dir, nil
}

func downloadSkillFile(ctx context.Context, client *s3.Client, bucket, key, dst string) error {
	out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return fmt.Errorf("reading s3://%s/%s: %w", bucket, key, err)
	}
	defer out.Body.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	// admin_api allows 2 MB per skill: a larger object is not a skill file.
	_, err = io.Copy(f, io.LimitReader(out.Body, 4<<20))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

// buildSkillLibrary loads the chosen skills from a cached version, in the
// node's order. A skill that is not in the bucket, does not load, or has
// the name of one loaded before (the agent knows skills by name) is left
// out with a warning.
func buildSkillLibrary(dir string, refs []aiAgentSkillRef, nodeUid string, log *logger.Logger) *skill.Library {
	lib := skill.NewLibrary()
	for _, ref := range refs {
		if dir == "" { // none of the chosen skills is in the bucket
			log.Warnf("AiAgentNode %s: skill %s not found", nodeUid, ref)
			continue
		}
		manifest := filepath.Join(dir, ref.scope, ref.name, "SKILL.md")
		if _, err := os.Stat(manifest); errors.Is(err, os.ErrNotExist) {
			log.Warnf("AiAgentNode %s: skill %s not found", nodeUid, ref)
			continue
		}
		s, err := skill.LoadFile(manifest)
		if err != nil {
			log.Warnf("AiAgentNode %s: skill %s not loaded: %v", nodeUid, ref, err)
			continue
		}
		if _, dup := lib.Get(s.Name); dup {
			log.Warnf("AiAgentNode %s: skill %s left out: another chosen skill is named %q", nodeUid, ref, s.Name)
			continue
		}
		_ = lib.Add(s) // LoadFile validated it
	}
	return lib
}

// reloadSkillsIfChanged gives the agent its chosen skills when they
// changed in the bucket since the last check (and the first time). What
// cannot be checked or copied keeps the skills the agent has: the next
// prompt tries again. Called before each prompt; the MCP servers are not
// restarted.
func (n *AiAgentNode) reloadSkillsIfChanged(log *logger.Logger) {
	if len(n.skillRefs) == 0 {
		return
	}
	n.skillsMu.Lock()
	defer n.skillsMu.Unlock()

	client, bucket := n.Fm.GetS3Client(), n.Fm.GetS3BucketName()
	if client == nil || bucket == "" {
		if !n.skillsWarned {
			log.Warnf("AiAgentNode %s: no bucket: the skills cannot be loaded", n.NodeUid)
			n.skillsWarned = true
		}
		return
	}
	ctx, cancel := context.WithTimeout(n.Ctx, aiAgentSkillsSyncTimeout)
	defer cancel()

	p := n.Pipeline
	objects, version, err := listChosenSkills(ctx, client, bucket, p.GetOrgId(), p.GetGroupId(), n.skillRefs)
	if err != nil {
		log.Warnf("AiAgentNode %s: could not check the skills: %v", n.NodeUid, err)
		return
	}
	if n.skillsChecked && version == n.skillsVersion {
		return
	}

	dir := ""
	if version != "" {
		if dir, err = syncSkills(ctx, client, bucket, version, objects); err != nil {
			log.Warnf("AiAgentNode %s: could not copy the skills: %v", n.NodeUid, err)
			return
		}
	}
	lib := buildSkillLibrary(dir, n.skillRefs, n.NodeUid, log)
	first := !n.skillsChecked
	n.skillsVersion, n.skillsChecked = version, true

	n.hostMu.Lock()
	n.skillLib = lib
	if n.agentHost != nil {
		n.agentHost.SetSkills(lib)
	}
	n.hostMu.Unlock()

	names := make([]string, 0, lib.Len())
	for _, s := range lib.List() {
		names = append(names, s.Name)
	}
	what := "skills changed"
	if first {
		what = "skills loaded"
	}
	log.Infof("AiAgentNode %s: %s (%d of %d: %s)", n.NodeUid, what, lib.Len(), len(n.skillRefs), strings.Join(names, ", "))
}
