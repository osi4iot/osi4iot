package flows_manager

import "testing"

func TestFemResultsParquetPrefix(t *testing.T) {
	cases := map[string]string{
		"":         "org_data/org_1/group_2/digitalTwin_3/femResParquet",
		"slide-1":  "org_data/org_1/group_2/digitalTwin_3/slides/slide-1/femResParquet",
		"s1:Fr_a9": "org_data/org_1/group_2/digitalTwin_3/slides/s1/frames/Fr_a9/femResParquet",
	}
	for scope, want := range cases {
		if got := femResultsParquetPrefix(1, 2, 3, scope); got != want {
			t.Errorf("scope %q: got %q, want %q", scope, got, want)
		}
	}
}
