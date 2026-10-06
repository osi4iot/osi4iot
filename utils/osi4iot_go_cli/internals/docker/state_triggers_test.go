package docker

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
)

// The reported case: an osi4iot_state.json in plain JSON (accepted on
// read without --no-encrypt). The backup must upload it encrypted, and
// leave the file on disk untouched.
func TestStateFileBackupPayloadEncryptsPlainFile(t *testing.T) {
	dir := t.TempDir()
	wd, _ := os.Getwd()
	defer os.Chdir(wd)
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OSI4IOT_PASSPHRASE", "correct horse battery staple")

	plain := []byte(`{"PlatformInfo": {"PLATFORM_NAME": "OSI-DEMO"}}`)
	if err := os.WriteFile("osi4iot_state.json", plain, 0600); err != nil {
		t.Fatal(err)
	}

	payload, err := stateFileBackupPayload()
	if err != nil {
		t.Fatal(err)
	}
	if json.Valid([]byte(payload)) {
		t.Fatal("the backup payload is plain JSON: secrets would leave in the clear")
	}
	back, err := crypto.Decrypt([]byte(payload), []byte("correct horse battery staple"))
	if err != nil || string(back) != string(plain) {
		t.Fatalf("payload does not decrypt to the file: %v", err)
	}
	onDisk, _ := os.ReadFile("osi4iot_state.json")
	if string(onDisk) != string(plain) {
		t.Fatal("the file on disk was modified")
	}

	// An already encrypted file is uploaded byte for byte.
	if err := os.WriteFile("osi4iot_state.json", []byte(payload), 0600); err != nil {
		t.Fatal(err)
	}
	again, err := stateFileBackupPayload()
	if err != nil || again != payload {
		t.Fatalf("encrypted file not uploaded as is: %v", err)
	}
}
