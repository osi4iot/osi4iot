package volumes

import "testing"

func TestGarageVolumesArePinned(t *testing.T) {
	for name, want := range map[string]string{"garage_meta_3": "garage_3", "garage_data_12": "garage_12"} {
		key, value, ok := pinnedVolumeLabel(name)
		if !ok || key != want || value != "true" {
			t.Errorf("%s -> %s=%s (%v), want %s=true", name, key, value, ok, want)
		}
	}
	if _, _, ok := pinnedVolumeLabel("garage_meta"); ok {
		t.Error("an unnumbered name is not an instance volume")
	}
}


