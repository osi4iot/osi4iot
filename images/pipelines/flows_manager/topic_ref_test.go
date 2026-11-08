package flows_manager

import "testing"

func TestIsAssetTopicRef(t *testing.T) {
	for ref, want := range map[string]bool{
		"dev2pdb_1": true, "dev2pdb_12": true, "dev2dtm_2": true, "dtm2dev_1": true,
		"dev2dtm": false, "dtm2dev": false, "sim2dtm": false, "dev2sim": false, "dev2dtm_": false, "xdev2dtm_1": false,
	} {
		if got := IsAssetTopicRef(ref); got != want {
			t.Errorf("IsAssetTopicRef(%q) = %v, want %v", ref, got, want)
		}
	}
}
