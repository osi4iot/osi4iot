package nodes

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"pipelines/logger"
)

// fakeSkillsS3 answers ListObjectsV2 and GetObject (path-style) from a map.
type fakeSkillsS3 struct {
	mu   sync.Mutex
	objs map[string]string
	gets int
}

func (f *fakeSkillsS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	path := strings.TrimPrefix(r.URL.Path, "/bucket")
	if path == "" || path == "/" {
		prefix := r.URL.Query().Get("prefix")
		var keys []string
		for k := range f.objs {
			if strings.HasPrefix(k, prefix) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		var b strings.Builder
		b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>bucket</Name><IsTruncated>false</IsTruncated>`)
		fmt.Fprintf(&b, "<KeyCount>%d</KeyCount>", len(keys))
		for _, k := range keys {
			sum := md5.Sum([]byte(f.objs[k]))
			fmt.Fprintf(&b, `<Contents><Key>%s</Key><ETag>"%s"</ETag><Size>%d</Size><LastModified>2026-10-30T00:00:00.000Z</LastModified></Contents>`,
				k, hex.EncodeToString(sum[:]), len(f.objs[k]))
		}
		b.WriteString("</ListBucketResult>")
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(b.String()))
		return
	}
	body, ok := f.objs[strings.TrimPrefix(path, "/")]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`<Error><Code>NoSuchKey</Code></Error>`))
		return
	}
	f.gets++
	_, _ = w.Write([]byte(body))
}

func testSkillMd(name, description string) string {
	return "---\nname: " + name + "\ndescription: " + description + "\n---\nInstructions.\n"
}

func TestParseAiAgentSkills(t *testing.T) {
	refs, invalid := parseAiAgentSkills(map[string]interface{}{"skills": []interface{}{
		"platform:fem-analysis", "group:max-load", "group:max-load", "bad", "platform:Bad_Name", "other:x", 3,
	}})
	if len(refs) != 2 || refs[0].String() != "platform:fem-analysis" || refs[1].String() != "group:max-load" {
		t.Fatalf("refs = %v", refs)
	}
	if len(invalid) != 4 {
		t.Fatalf("invalid = %v", invalid)
	}
	if refs, _ := parseAiAgentSkills(map[string]interface{}{}); len(refs) != 0 {
		t.Fatalf("no setting: %v", refs)
	}
}

func TestSkillsFromBucket(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	fake := &fakeSkillsS3{objs: map[string]string{
		"platform_data/skills/fem-analysis/SKILL.md":         testSkillMd("fem-analysis", "FEM"),
		"platform_data/skills/fem-analysis/ref/checklist.md": "check",
		"platform_data/skills/not-chosen/SKILL.md":           testSkillMd("not-chosen", "x"),
		"org_data/org_1/group_2/skills/max-load/SKILL.md":    testSkillMd("max-load", "Pmax"),
		"org_data/org_1/group_2/skills/broken/SKILL.md":      "no frontmatter",
		"org_data/org_1/group_2/skills/fem-dup/SKILL.md":     testSkillMd("fem-analysis", "same name"),
		"org_data/org_9/group_9/skills/max-load/SKILL.md":    testSkillMd("max-load", "another group"),
	}}
	srv := httptest.NewServer(fake)
	defer srv.Close()
	client := s3.New(s3.Options{
		Region: "us-east-1", BaseEndpoint: aws.String(srv.URL), UsePathStyle: true,
		Credentials: aws.AnonymousCredentials{},
	})
	ctx := context.Background()
	refs, _ := parseAiAgentSkills(map[string]interface{}{"skills": []interface{}{
		"platform:fem-analysis", "group:max-load", "group:broken", "group:fem-dup", "group:missing",
	}})

	objects, version, err := listChosenSkills(ctx, client, "bucket", 1, 2, refs)
	if err != nil || version == "" {
		t.Fatalf("list: %v %q", err, version)
	}
	if len(objects) != 5 { // not-chosen and the other group's are left out
		t.Fatalf("objects = %d", len(objects))
	}
	dir, err := syncSkills(ctx, client, "bucket", version, objects)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	gets := fake.gets
	if again, err := syncSkills(ctx, client, "bucket", version, objects); err != nil || again != dir || fake.gets != gets {
		t.Fatalf("the same version is copied again")
	}

	lib := buildSkillLibrary(dir, refs, "n1", logger.NewLogger())
	// broken does not load, fem-dup repeats a name, missing is not there.
	if lib.Len() != 2 {
		t.Fatalf("skills = %d", lib.Len())
	}
	s, ok := lib.Get("max-load")
	if !ok || s.Description != "Pmax" {
		t.Fatalf("max-load = %+v", s)
	}
	fem, _ := lib.Get("fem-analysis")
	if c, err := fem.ReadResource("ref/checklist.md"); err != nil || c != "check" {
		t.Fatalf("resource: %q %v", c, err)
	}

	// A change of a file is a new version.
	fake.mu.Lock()
	fake.objs["org_data/org_1/group_2/skills/max-load/SKILL.md"] = testSkillMd("max-load", "Pmax v2")
	fake.mu.Unlock()
	if _, v2, _ := listChosenSkills(ctx, client, "bucket", 1, 2, refs); v2 == version {
		t.Fatalf("version unchanged after an edit")
	}

	// A key that would write outside the folder is refused.
	bad := []skillObject{{ref: refs[0], key: "k", rel: "../escape.md"}}
	if _, err := syncSkills(ctx, client, "bucket", "bad-version", bad); err == nil {
		t.Fatalf("path escape accepted")
	}
}
