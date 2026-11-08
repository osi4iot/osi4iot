package nodes

// The OC4 recipe on a real video (mobile/public/test/video.mp4 of the
// repository, frames at 10 fps through yolo-pose-s-coco-640.onnx, run with
// onnxruntime outside): the recipe's Function decodes the raw outputs with
// the real PostprocessPose and the Pose estimation node works on them. Set
// OC4_VIDEO_DUMP to the prefix of <prefix>.bin (float32 outputs) and
// <prefix>.json (letterbox of each frame), and GUIA_RECIPES. With
// OC4_VIDEO_OUT, the poses go to that JSON (for an overlay on the frames).

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/dop251/goja"

	fl "pipelines/function_library"
	"pipelines/geometry"
)

type realYoloGo struct{ yolo *fl.Yolo }

func (g *realYoloGo) All() map[string]any { return map[string]any{"yolo": g.yolo, "log": fakeLog{}} }

func TestOC4RealVideo(t *testing.T) {
	prefix := os.Getenv("OC4_VIDEO_DUMP")
	if prefix == "" {
		t.Skip("OC4_VIDEO_DUMP not set")
	}
	recipes := loadGuiaRecipes(t)
	byName := map[string]guiaNode{}
	for _, n := range recipes["10_oc4_pose.yml"] {
		byName[n.Name] = n
	}
	var meta []map[string]any
	raw, err := os.ReadFile(prefix + ".json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		t.Fatal(err)
	}
	bin, err := os.ReadFile(prefix + ".bin")
	if err != nil {
		t.Fatal(err)
	}
	vm := goja.New()
	_ = vm.Set("Go", func() *realYoloGo { return &realYoloGo{yolo: fl.NewYolo(nil, nil)} })
	if _, err := vm.RunString(byName["Detecciones y keypoints"].Settings["onMessageScript"].(string)); err != nil {
		t.Fatal(err)
	}
	cfg, err := parsePoseConfig(byName["Pose de la cámara y rotor"].Settings)
	if err != nil {
		t.Fatal(err)
	}
	fps := 10.0
	if v, err := strconv.ParseFloat(os.Getenv("OC4_VIDEO_FPS"), 64); err == nil && v > 0 {
		fps = v
	}
	var state *poseState
	offset := 0
	ok, noDet := 0, 0
	reasons := map[string]int{}
	var rms, inliers, rotorObs []float64
	type outFrame struct {
		File      string               `json:"file"`
		Ok        bool                 `json:"ok"`
		Reason    string               `json:"reason,omitempty"`
		Rvec      []float64            `json:"rvec,omitempty"`
		Tvec      []float64            `json:"tvec,omitempty"`
		Fx        float64              `json:"fx,omitempty"`
		Rotor     map[string]any       `json:"rotor,omitempty"`
		Keypoints map[string][]float64 `json:"keypoints,omitempty"`
		Outliers  []string             `json:"outliers,omitempty"`
		Camera    map[string]any       `json:"camera,omitempty"`
		Inliers   int                  `json:"inliers,omitempty"`
		RMS       float64              `json:"rms,omitempty"`
	}
	var frames []outFrame
	var angles []float64
	for i, m := range meta {
		n := int(m["len"].(float64))
		out := make([]float32, n)
		for k := 0; k < n; k++ {
			out[k] = math.Float32frombits(binary.LittleEndian.Uint32(bin[(offset+k)*4:]))
		}
		offset += n
		ms := int64(1_700_000_000_000 + float64(i)*1000/fps)
		res := runScript(t, vm, map[string]any{
			"letterbox": map[string]any{"scale": m["scale"], "padX": m["padX"], "padY": m["padY"],
				"width": m["width"], "height": m["height"]},
			"mlmOutput":      out,
			"frameTimestamp": float64(ms),
		})
		payload := res.(map[string]any)["payload"].(map[string]any)
		dets, _ := payload["detections"].([]any)
		if len(dets) == 0 {
			noDet++
		}
		next, f := cfg.step(state, "dev2dtm", payload, time.UnixMilli(ms))
		state = next
		of := outFrame{File: m["file"].(string), Ok: f.ok, Reason: f.reason}
		kps, _ := cfg.readKeypoints("", payload)
		of.Keypoints = map[string][]float64{}
		for name, kp := range kps {
			of.Keypoints[name] = []float64{kp.U, kp.V, kp.Conf}
		}
		if !f.ok {
			reasons[f.reason]++
			frames = append(frames, of)
			continue
		}
		ok++
		rms = append(rms, f.result["reprojectionError"].(float64))
		inliers = append(inliers, float64(f.result["inliers"].(int)))
		cv := f.result["opencv"].(map[string]any)
		of.Rvec, of.Tvec = cv["rvec"].([]float64), cv["tvec"].([]float64)
		of.Outliers = f.result["outliers"].([]string)
		of.Camera, _ = f.result["camera"].(map[string]any)
		of.Inliers = f.result["inliers"].(int)
		of.RMS = f.result["reprojectionError"].(float64)
		cam, _, _, _ := cfg.camera("", payload)
		of.Fx = cam.Fx
		if parts, has := f.result["parts"].(map[string]any); has {
			r := parts["rotor"].(map[string]any)
			of.Rotor = r
			rotorObs = append(rotorObs, float64(r["observed"].(int)))
			if r["ready"] == true && r["observed"].(int) > 0 {
				angles = append(angles, r["angleUnwrapped"].(float64))
			}
		}
		frames = append(frames, of)
	}
	med := func(v []float64) float64 {
		if len(v) == 0 {
			return math.NaN()
		}
		c := append([]float64(nil), v...)
		sort.Float64s(c)
		return c[len(c)/2]
	}
	t.Logf("%d frames: %d with pose, %d without detections; reasons %v", len(meta), ok, noDet, reasons)
	t.Logf("reprojection error median %.2f px, inliers median %.0f, blade points median %.0f", med(rms), med(inliers), med(rotorObs))
	if len(angles) > 1 {
		t.Logf("rotor: %.1f° -> %.1f° unwrapped over %d frames with blades", angles[0], angles[len(angles)-1], len(angles))
	}
	_ = geometry.Vec3{}
	if path := os.Getenv("OC4_VIDEO_OUT"); path != "" {
		b, _ := json.Marshal(frames)
		_ = os.WriteFile(path, b, 0o644)
	}
	if ok < len(meta)/2 {
		t.Errorf("pose in %d of %d frames", ok, len(meta))
	}
}
