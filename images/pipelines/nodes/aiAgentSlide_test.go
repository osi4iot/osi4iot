package nodes

import "testing"

func TestPromptSlideScopes(t *testing.T) {
	field := func(v any) func(string) (any, bool) {
		return func(name string) (any, bool) { return v, name == SlideField }
	}
	cases := map[string]string{"slide-1": "slide-1", "s1:Fr_a9": "s1:Fr_a9", "s1:a:b": "", "../x": ""}
	for in, want := range cases {
		if got := promptSlide(field(in), nil); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
}
