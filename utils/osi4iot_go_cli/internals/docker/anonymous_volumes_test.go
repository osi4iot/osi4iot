package docker

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The Garage image declares /var/lib/garage/meta and /var/lib/garage/data
// as VOLUME: a helper started from it with nothing mounted there would
// get two anonymous volumes per run (seen on a manager: one pair per
// bucket check or snapshot).
func TestRcloneHelperMountsTmpfsOverImageVolumes(t *testing.T) {
	hc := rcloneHelperHostConfig()
	for _, path := range garageImageVolumes {
		if _, ok := hc.Tmpfs[path]; !ok {
			t.Errorf("%s not covered by tmpfs: the helper would create an anonymous volume", path)
		}
	}
	if len(hc.Mounts) != 0 || len(hc.Binds) != 0 {
		t.Error("the helper must not mount anything from the host")
	}
}

// Guard: every container this package removes goes with its anonymous
// volumes. A helper added later without RemoveVolumes would leak them
// again, so this fails until it is given.
func TestEveryContainerRemoveRemovesAnonymousVolumes(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	fset := token.NewFileSet()
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		f, err := parser.ParseFile(fset, file, src, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(f, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "ContainerRemove" || len(call.Args) < 3 {
				return true
			}
			opts := string(src[fset.Position(call.Args[2].Pos()).Offset:fset.Position(call.Args[2].End()).Offset])
			if !strings.Contains(opts, "RemoveVolumes: true") {
				t.Errorf("%s: ContainerRemove without RemoveVolumes: true (%s)", fset.Position(call.Pos()), opts)
			}
			return true
		})
	}
}
