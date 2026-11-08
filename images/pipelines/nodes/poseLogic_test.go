package nodes

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"testing"
	"time"

	"pipelines/geometry"
)

// The OC4 model: the 3D points of the repository (Blender, metres) and three
// blade tips, 120° apart around the rotor axis (Blender +Y) through the hub.
var oc4Blender = map[string][3]float64{
	"pontoon_right_3":      {-0.216, -0.003, 0.341},
	"pontoon_left_3":       {0.218, -0.003, 0.341},
	"pontoon_left_1":       {0.249, 0.051, 0.341},
	"pontoon_front_1":      {-0.032, 0.428, 0.341},
	"pontoon_front_2":      {0.036, 0.429, 0.34},
	"pontoon_front_3":      {-0.247, 0.051, 0.341},
	"Hub":                  {0.001, 0.306, 1.145},
	"pontoon_center_left":  {0.28, -0.003, 0.35},
	"pontoon_center_right": {-0.278, -0.003, 0.35},
	"pontoon_center_front": {0.001, 0.481, 0.35},
	"pilar_center":         {0.001, 0.194, 0.788},
}

const bladeLength = 0.5

var oc4Order = []string{"Blade_1", "Blade_2", "Blade_3", "Hub", "pilar_center", "pontoon_center_front", "pontoon_center_left",
	"pontoon_center_right", "pontoon_front_1", "pontoon_front_2", "pontoon_front_3", "pontoon_left_1", "pontoon_left_3", "pontoon_right_3"}

func oc4Points() map[string]any {
	out := map[string]any{}
	for name, p := range oc4Blender {
		out[name] = []any{p[0], p[1], p[2]}
	}
	hub := oc4Blender["Hub"]
	for i := 0; i < 3; i++ {
		// blade i at 90° + i*120° in the rotor plane (Blender X-Z), turning about +Y
		a := math.Pi/2 + float64(i)*2*math.Pi/3
		// in the rotor plane (Blender X-Z)
		out["Blade_"+string(rune('1'+i))] = []any{hub[0] + bladeLength*math.Cos(a), hub[1], hub[2] + bladeLength*math.Sin(a)}
	}
	return out
}

func oc4Settings(extra map[string]any) map[string]any {
	names := make([]any, len(oc4Order))
	for i, n := range oc4Order {
		names[i] = n
	}
	s := map[string]any{
		"mode":          "camera",
		"pointsFrame":   "blender",
		"points":        oc4Points(),
		"keypointNames": names,
		"calibration": map[string]any{
			"camera_matrix": []any{[]any{1000.0, 0.0, 640.0}, []any{0.0, 1000.0, 360.0}, []any{0.0, 0.0, 1.0}},
			"dist_coeffs":   []any{[]any{0.08, -0.15, 0.001, -0.0005, 0.05}},
			"image_width":   1280.0,
			"image_height":  720.0,
		},
		"timePath": "payload.timestamp",
		"parts": []any{map[string]any{
			"name": "rotor", "type": "rotation", "keypoints": []any{"Blade_1", "Blade_2", "Blade_3"},
			"axisOrigin": "Hub", "axisDirection": []any{0.0, 1.0, 0.0}, "symmetry": 3.0, "nodeName": "Rotor",
		}},
	}
	for k, v := range extra {
		if k == "part" {
			part := s["parts"].([]any)[0].(map[string]any)
			for pk, pv := range v.(map[string]any) {
				part[pk] = pv
			}
			continue
		}
		s[k] = v
	}
	// as the editor saves it: JSON
	b, _ := json.Marshal(s)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}

var testCam = geometry.Camera{Fx: 1000, Fy: 1000, Cx: 640, Cy: 360, Dist: [5]float64{0.08, -0.15, 0.001, -0.0005, 0.05}}

// lookAtY: an OpenCV pose of a camera at eye looking at target, Y up (viewer frame)
func lookAtY(eye, target geometry.Vec3) geometry.Pose {
	z := target.Sub(eye).Unit()
	x := z.Cross(geometry.Vec3{0, 1, 0}).Unit()
	y := z.Cross(x)
	R := geometry.Mat3{x, y, z}
	return geometry.Pose{R: R, T: R.MulVec(eye).Scale(-1)}
}

// frame: the keypoints that a perfect detector (plus noise) gives
func oc4Frame(pose geometry.Pose, rotor float64, ms int64, rng *rand.Rand, noise float64) map[string]any {
	hub := geometry.BlenderToGLTF(geometry.Vec3(oc4Blender["Hub"]))
	axis := geometry.BlenderToGLTF(geometry.Vec3{0, 1, 0})
	turn := geometry.Rodrigues(axis.Scale(rotor))
	pts := oc4Points()
	kps := []any{}
	for _, name := range oc4Order {
		raw := pts[name].([]any)
		p := geometry.BlenderToGLTF(geometry.Vec3{raw[0].(float64), raw[1].(float64), raw[2].(float64)})
		if strings.HasPrefix(name, "Blade") {
			p = hub.Add(turn.MulVec(p.Sub(hub)))
		}
		u, v, ok := testCam.Project(pose.Apply(p))
		conf := 0.9
		if !ok {
			conf = 0
		}
		kps = append(kps, map[string]any{"x": u + rng.NormFloat64()*noise, "y": v + rng.NormFloat64()*noise, "conf": conf})
	}
	return map[string]any{
		"detections": []any{
			map[string]any{"label": "oc4", "confidence": 0.3, "keypoints": kps[:5]}, // a weaker, partial detection
			map[string]any{"label": "oc4", "confidence": 0.95, "keypoints": kps},
		},
		"width": 1280.0, "height": 720.0, "timestamp": float64(ms),
	}
}

func viewerTarget() geometry.Vec3 {
	return geometry.BlenderToGLTF(geometry.Vec3{0, 0.2, 0.7})
}

// eyeAt: a phone walked slowly around the model
func eyeAt(t float64) geometry.Vec3 {
	az := 0.3 + 0.15*t
	return viewerTarget().Add(geometry.Vec3{2.2 * math.Sin(az), 0.4 + 0.1*math.Sin(t), 2.2 * math.Cos(az)})
}

type rotorRun struct {
	maxCamErr, maxAngleErr, lastSpeed float64
	slips                             int
	warnings                          []string
}

func runRotor(t *testing.T, cfg *poseConfig, fps float64, speed float64, seconds float64) rotorRun {
	t.Helper()
	rng := rand.New(rand.NewSource(42))
	var state *poseState
	var r rotorRun
	var offset float64
	first := true
	frames := int(seconds * fps)
	for i := 0; i < frames; i++ {
		tm := float64(i) / fps
		ms := int64(1_700_000_000_000 + tm*1000)
		eye := eyeAt(tm)
		truth := lookAtY(eye, viewerTarget())
		rotor := 0.2 + speed*tm
		payload := oc4Frame(truth, rotor, ms, rng, 0.8)
		next, f := cfg.step(state, "dev2pdb", payload, time.UnixMilli(ms))
		if !f.ok {
			t.Fatalf("frame %d: %s", i, f.reason)
		}
		state = next
		cam := f.result["camera"].(map[string]any)
		pos := cam["position"].([]float64)
		if i > 5 {
			if e := (geometry.Vec3{pos[0], pos[1], pos[2]}).Sub(eye).Norm(); e > r.maxCamErr {
				r.maxCamErr = e
			}
		}
		part := f.result["parts"].(map[string]any)["rotor"].(map[string]any)
		if w, ok := f.result["warnings"].([]string); ok {
			r.warnings = append(r.warnings, w...)
		}
		est := part["angleUnwrapped"].(float64) * math.Pi / 180
		// the blades are alike: the estimate equals the truth up to a whole number of 120° steps, fixed once
		if first {
			offset = math.Round((est-rotor)/(2*math.Pi/3)) * (2 * math.Pi / 3)
			first = false
		}
		diff := est - rotor - offset
		if math.Abs(diff) > math.Pi/3 {
			r.slips++
			offset += math.Round(diff/(2*math.Pi/3)) * (2 * math.Pi / 3)
			diff = est - rotor - offset
		}
		if i > 10 && math.Abs(diff) > r.maxAngleErr {
			r.maxAngleErr = math.Abs(diff)
		}
		r.lastSpeed = part["angularVelocity"].(float64)
	}
	return r
}

func TestPoseOC4CameraAndRotorAt10fps(t *testing.T) {
	cfg, err := parsePoseConfig(oc4Settings(nil))
	if err != nil {
		t.Fatal(err)
	}
	r := runRotor(t, cfg, 10, 2*math.Pi, 8)
	t.Logf("10 fps: camera error up to %.1f mm, rotor error up to %.2f°, speed %.3f rad/s", r.maxCamErr*1000, r.maxAngleErr*180/math.Pi, r.lastSpeed)
	if r.maxCamErr > 0.06 {
		t.Errorf("camera off by %.3f m", r.maxCamErr)
	}
	if r.slips != 0 || r.maxAngleErr > 4*math.Pi/180 {
		t.Errorf("rotor: %d slips, max error %.2f°", r.slips, r.maxAngleErr*180/math.Pi)
	}
	if math.Abs(r.lastSpeed-2*math.Pi) > 0.3 {
		t.Errorf("speed %.3f rad/s", r.lastSpeed)
	}
	if len(r.warnings) != 0 {
		t.Errorf("warnings %v", r.warnings[0])
	}
}

func TestPoseOC4RotorAt4fps(t *testing.T) {
	// 90° per frame: more than half the 120° between blades, so without a
	// prior the rotor looks like it turns 30° per frame backwards
	cfg, _ := parsePoseConfig(oc4Settings(nil))
	r := runRotor(t, cfg, 4, 2*math.Pi, 8)
	if math.Abs(r.lastSpeed-(-2*math.Pi/3)) > 0.3 {
		t.Errorf("aliased speed %.3f rad/s, expected about %.3f", r.lastSpeed, -2*math.Pi/3)
	}
	// knowing the direction is enough: up to 120° per frame
	cfg, _ = parsePoseConfig(oc4Settings(map[string]any{"part": map[string]any{"direction": "positive"}}))
	r = runRotor(t, cfg, 4, 2*math.Pi, 8)
	if r.slips != 0 || math.Abs(r.lastSpeed-2*math.Pi) > 0.3 {
		t.Errorf("with direction: %d slips, speed %.3f", r.slips, r.lastSpeed)
	}
	// or the expected speed
	cfg, _ = parsePoseConfig(oc4Settings(map[string]any{"part": map[string]any{"expectedSpeed": 2 * math.Pi}}))
	r = runRotor(t, cfg, 4, 2*math.Pi, 8)
	if r.slips != 0 || math.Abs(r.lastSpeed-2*math.Pi) > 0.3 {
		t.Errorf("with expected speed: %d slips, speed %.3f", r.slips, r.lastSpeed)
	}
}

func TestPoseWarnsCloseToAliasing(t *testing.T) {
	// 50° per frame at 10 fps: still right, but close to the 60° limit
	cfg, _ := parsePoseConfig(oc4Settings(nil))
	r := runRotor(t, cfg, 10, 50*math.Pi/180*10, 5)
	if r.slips != 0 || len(r.warnings) == 0 || !strings.Contains(r.warnings[0], "3-fold") {
		t.Errorf("%d slips, warnings %v", r.slips, r.warnings)
	}
}

func TestPoseViewerOutputs(t *testing.T) {
	cfg, _ := parsePoseConfig(oc4Settings(nil))
	rng := rand.New(rand.NewSource(1))
	eye := eyeAt(0)
	truth := lookAtY(eye, viewerTarget())
	_, f := cfg.step(nil, "", oc4Frame(truth, 0.2, 1000, rng, 0), time.UnixMilli(1000))
	if !f.ok {
		t.Fatal(f.reason)
	}
	q := f.camera["quaternion"].([]float64)
	m := geometry.MatrixFromQuaternion([4]float64{q[0], q[1], q[2], q[3]})
	forward := m.MulVec(geometry.Vec3{0, 0, -1})
	want := viewerTarget().Sub(eye).Unit()
	if forward.Sub(want).Norm() > 0.01 {
		t.Fatalf("the viewer camera looks along %v, not %v", forward, want)
	}
	if f.camera["follow"] != true || f.camera["projection"] != "perspective" {
		t.Fatal(f.camera)
	}
	// 2 atan(360 / 1000)
	if fov := f.camera["fov"].(float64); math.Abs(fov-39.598) > 0.01 {
		t.Fatal(fov)
	}
	rotor := f.animated["Rotor"].(map[string]any)["quaternion"].([]float64)
	if len(rotor) != 4 {
		t.Fatal(f.animated)
	}
	if f.result["inliers"].(int) != 11 || len(f.result["outliers"].([]string)) != 0 {
		t.Fatal(f.result)
	}
}

func TestPoseObjectMode(t *testing.T) {
	cfg, err := parsePoseConfig(oc4Settings(map[string]any{"mode": "object", "parts": []any{}, "objectNodeName": "Platform"}))
	if err != nil {
		t.Fatal(err)
	}
	rng := rand.New(rand.NewSource(3))
	cam := lookAtY(geometry.Vec3{0.5, 0.8, 2.5}, viewerTarget())
	var state *poseState
	var f poseFrame
	for i := 0; i < 20; i++ {
		// the platform pitches 5° about the viewer X axis and heaves 3 cm
		pitch := 5 * math.Pi / 180 * float64(i) / 19
		heave := 0.03 * float64(i) / 19
		motion := geometry.Pose{R: geometry.Rodrigues(geometry.Vec3{pitch, 0, 0}), T: geometry.Vec3{0, heave, 0}}
		// the camera sees the moved object: X_cam = Rc (Rm X + tm) + tc
		seen := geometry.Pose{R: cam.R.Mul(motion.R), T: cam.R.MulVec(motion.T).Add(cam.T)}
		ms := int64(1_700_000_000_000 + i*100)
		state, f = cfg.step(state, "", oc4Frame(seen, 0, ms, rng, 0.3), time.UnixMilli(ms))
		if !f.ok {
			t.Fatal(f.reason)
		}
	}
	obj := f.result["object"].(map[string]any)
	rot := obj["rotation"].(map[string]any)
	pos := obj["position"].([]float64)
	if math.Abs(rot["x"].(float64)-5) > 1 || math.Abs(rot["y"].(float64)) > 1 {
		t.Fatalf("rotation %v", rot)
	}
	if math.Abs(pos[1]-0.03) > 0.02 {
		t.Fatalf("position %v", pos)
	}
	if _, ok := f.animated["Platform"]; !ok || f.camera != nil {
		t.Fatal(f.animated, f.camera)
	}
}

func TestPoseInputsAndFailures(t *testing.T) {
	cfg, _ := parsePoseConfig(oc4Settings(nil))
	truth := lookAtY(eyeAt(0), viewerTarget())
	rng := rand.New(rand.NewSource(1))
	frame := oc4Frame(truth, 0, 1000, rng, 0)
	full := frame["detections"].([]any)[1].(map[string]any)["keypoints"].([]any)

	// a map of named keypoints, [x, y, conf]
	named := map[string]any{}
	for i, kp := range full {
		m := kp.(map[string]any)
		named[oc4Order[i]] = []any{m["x"], m["y"], m["conf"]}
	}
	_, f := cfg.step(nil, "", map[string]any{"keypoints": named, "width": 1280.0, "height": 720.0}, time.Now())
	if !f.ok {
		t.Fatalf("named keypoints: %s", f.reason)
	}
	// a list of {name, x, y}; at the calibration's half size
	list := []any{}
	for i, kp := range full {
		m := kp.(map[string]any)
		list = append(list, map[string]any{"name": oc4Order[i], "x": m["x"].(float64) / 2, "y": m["y"].(float64) / 2})
	}
	_, f = cfg.step(nil, "", map[string]any{"keypoints": list, "width": 640.0, "height": 360.0}, time.Now())
	if !f.ok {
		t.Fatalf("half size: %s", f.reason)
	}
	// rotated frames
	_, f = cfg.step(nil, "", map[string]any{"keypoints": list, "width": 360.0, "height": 640.0}, time.Now())
	if f.ok || !strings.Contains(f.reason, "rotated") {
		t.Fatalf("rotated: %v", f.reason)
	}
	// too few keypoints, low confidence ones left out
	few := map[string]any{}
	for i, kp := range full {
		m := kp.(map[string]any)
		conf := 0.9
		if i > 6 {
			conf = 0.2
		}
		few[oc4Order[i]] = map[string]any{"x": m["x"], "y": m["y"], "confidence": conf}
	}
	_, f = cfg.step(nil, "", map[string]any{"keypoints": few, "width": 1280.0, "height": 720.0}, time.Now())
	if f.ok || !strings.Contains(f.reason, "needed") {
		t.Fatalf("few: %v", f.reason)
	}
	// no detection
	_, f = cfg.step(nil, "", map[string]any{"detections": []any{}}, time.Now())
	if f.ok || f.reason != "no detection" {
		t.Fatalf("empty: %v", f.reason)
	}
	// without calibration, from the image size
	s := oc4Settings(nil)
	delete(s, "calibration")
	nocal, err := parsePoseConfig(s)
	if err != nil {
		t.Fatal(err)
	}
	_, f = nocal.step(nil, "", frame, time.Now())
	if !f.ok || len(f.result["warnings"].([]string)) == 0 {
		t.Fatalf("uncalibrated: %v %v", f.reason, f.result)
	}
}

func TestPoseSettingsErrors(t *testing.T) {
	cases := map[string]map[string]any{
		"mode must be":             {"mode": "orbit"},
		"axisDirection":            {"part": map[string]any{"axisDirection": []any{0.0, 0.0, 0.0}}},
		"has no 3D point":          {"part": map[string]any{"keypoints": []any{"Blade_9"}}},
		"on the axis":              {"part": map[string]any{"keypoints": []any{"Hub"}}},
		"9 numbers":                {"calibration": map[string]any{"camera_matrix": []any{1.0, 2.0}}},
		"is not valid JSON":        {"points": "{oops"},
		"minPoints is 20":          {"minPoints": 20.0},
		"none of keypointNames":    {"keypointNames": []any{"a", "b"}},
		"pointsFrame must be":      {"pointsFrame": "maya"},
		"direction must be":        {"part": map[string]any{"direction": "sideways"}},
		"need zeroDirection":       {"part": map[string]any{"restAngles": map[string]any{"Blade_1": 0.0}}},
		"must be an object {class": {"keypointNamesByClass": []any{"a"}},
	}
	for want, extra := range cases {
		if _, err := parsePoseConfig(oc4Settings(extra)); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v", want, err)
		}
	}
	// a calibration as text, OpenCV's {rows, cols, data}, 8 coefficients
	cal := `{"camera_matrix": {"rows": 3, "cols": 3, "data": [900, 0, 640, 0, 900, 360, 0, 0, 1]}, "distortion_coefficients": {"data": [0.1, -0.2, 0, 0, 0.05, 0.01, 0, 0]}, "image_size": [1280, 720]}`
	cfg, err := parsePoseConfig(oc4Settings(map[string]any{"calibration": cal}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Calibration.Fx != 900 || cfg.Calibration.Dist[4] != 0.05 || cfg.CalibW != 1280 || len(cfg.Warnings) != 1 {
		t.Fatal(cfg.Calibration, cfg.CalibW, cfg.Warnings)
	}
}

// The OC4 set-up of the repository's pose_detection.py: a model with two
// classes, WindTurbine (11 keypoints, those of 3D_points.json) and Rotor (9:
// three per blade, coloured, so the blades are told apart), and OpenCV's
// calibration.json as the repository saves it (no image size).
var oc4Order11 = []string{"pontoon_right_3", "pontoon_left_3", "pontoon_left_1", "pontoon_front_1", "pontoon_front_2",
	"pontoon_front_3", "Hub", "pontoon_center_left", "pontoon_center_right", "pontoon_center_front", "pilar_center"}
var oc4Blades = []string{"blade_red", "blade_blue", "blade_yellow"}

func oc4TwoClassSettings() map[string]any {
	points := map[string]any{}
	for name, p := range oc4Blender {
		points[name] = map[string]any{"x": p[0], "y": p[1], "z": p[2]}
	}
	rotorNames := []any{}
	restAngles := map[string]any{}
	keypoints := []any{}
	for i, b := range oc4Blades {
		for j := 1; j <= 3; j++ {
			name := fmt.Sprintf("%s_%d", b, j)
			rotorNames = append(rotorNames, name)
			keypoints = append(keypoints, name)
			restAngles[name] = float64(i) * 120
		}
	}
	turbine := []any{}
	for _, n := range oc4Order11 {
		turbine = append(turbine, n)
	}
	s := map[string]any{
		"mode":                 "camera",
		"pointsFrame":          "blender",
		"points":               points,
		"keypointNamesByClass": map[string]any{"WindTurbine": turbine, "Rotor": rotorNames},
		"calibration": `{"intrinsic_matrix": [[1000, 0, 640], [0, 1000, 360], [0, 0, 1]],
			"distortion_coefficients": [[0.08, -0.15, 0.001, -0.0005, 0.05]]}`,
		"parts": []any{map[string]any{
			"name": "rotor", "keypoints": keypoints, "axisOrigin": "Hub", "axisDirection": []any{0.0, 1.0, 0.0},
			"zeroDirection": []any{0.0, 0.0, 1.0}, "restAngles": restAngles, "direction": "negative", "expectedSpeed": 2 * math.Pi,
			"nodeName": "Rotor",
		}},
	}
	b, _ := json.Marshal(s)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}

// two detections, at frames of 2x the calibration's size (2560x1440)
func oc4TwoClassFrame(pose geometry.Pose, rotor float64, ms int64, rng *rand.Rand) map[string]any {
	cam := testCam.Scaled(2, 2)
	px := func(p geometry.Vec3) map[string]any {
		u, v, _ := cam.Project(pose.Apply(p))
		return map[string]any{"x": u + rng.NormFloat64()*1.5, "y": v + rng.NormFloat64()*1.5, "conf": 0.9}
	}
	turbine := []any{}
	for _, n := range oc4Order11 {
		turbine = append(turbine, px(geometry.BlenderToGLTF(geometry.Vec3(oc4Blender[n]))))
	}
	hub := geometry.BlenderToGLTF(geometry.Vec3(oc4Blender["Hub"]))
	axis := geometry.BlenderToGLTF(geometry.Vec3{0, 1, 0})
	up := geometry.BlenderToGLTF(geometry.Vec3{0, 0, 1})
	blades := []any{}
	for i := range oc4Blades {
		dir := geometry.Rodrigues(axis.Scale(float64(i)*2*math.Pi/3 + rotor)).MulVec(up)
		for j := 1; j <= 3; j++ {
			// along the blade, a little out of the rotor plane (the blades are not flat)
			blades = append(blades, px(hub.Add(dir.Scale(0.15*float64(j))).Add(axis.Scale(0.01))))
		}
	}
	return map[string]any{
		"detections": []any{
			map[string]any{"label": "Rotor", "confidence": 0.8, "keypoints": blades},
			map[string]any{"label": "WindTurbine", "confidence": 0.9, "keypoints": turbine},
		},
		"width": 2560.0, "height": 1440.0, "timestamp": float64(ms),
	}
}

func TestPoseOC4TwoClassesColouredBlades(t *testing.T) {
	cfg, err := parsePoseConfig(oc4TwoClassSettings())
	if err != nil {
		t.Fatal(err)
	}
	for _, fps := range []float64{10, 4} {
		rng := rand.New(rand.NewSource(5))
		var state *poseState
		var maxErr, speed float64
		var warnings []string
		for i := 0; i < int(8*fps); i++ {
			tm := float64(i) / fps
			ms := int64(1_700_000_000_000 + tm*1000)
			truth := lookAtY(eyeAt(tm), viewerTarget())
			rotor := 0.4 - 2*math.Pi*tm // clockwise seen from the front: negative around +Y
			next, f := cfg.step(state, "", oc4TwoClassFrame(truth, rotor, ms, rng), time.UnixMilli(ms))
			if !f.ok {
				t.Fatalf("%v fps, frame %d: %s", fps, i, f.reason)
			}
			state = next
			part := f.result["parts"].(map[string]any)["rotor"].(map[string]any)
			if part["observed"].(int) != 9 {
				t.Fatalf("observed %v", part["observed"])
			}
			// coloured blades: the absolute angle, no 120° ambiguity
			est := part["angleUnwrapped"].(float64) * math.Pi / 180
			if e := math.Abs(est - rotor); i > 5 && e > maxErr {
				maxErr = e
			}
			if i >= int(4*fps) {
				// the mean of the second half
				speed += part["angularVelocity"].(float64) / float64(int(8*fps)-int(4*fps))
			}
			if w, ok := f.result["warnings"].([]string); ok {
				warnings = append(warnings, w...)
			}
		}
		t.Logf("%v fps: rotor error up to %.2f°, speed %.3f rad/s", fps, maxErr*180/math.Pi, speed)
		if maxErr > 3*math.Pi/180 || math.Abs(speed+2*math.Pi) > 0.3 {
			t.Errorf("%v fps: error %.2f°, speed %.3f", fps, maxErr*180/math.Pi, speed)
		}
		// the calibration without size is scaled, with a warning
		if len(warnings) == 0 || !strings.Contains(warnings[0], "no image size") {
			t.Errorf("warnings %v", warnings)
		}
	}
}

// A frame whose keypoints give a pose far from the track (a flipped pose of
// points nearly on a plane, keypoints bunched up by the detector) is left out;
// a change that the next frames confirm is taken.
func TestPoseLeavesOutJumps(t *testing.T) {
	cfg, err := parsePoseConfig(oc4Settings(nil))
	if err != nil {
		t.Fatal(err)
	}
	rng := rand.New(rand.NewSource(2))
	var state *poseState
	ms := int64(1_700_000_000_000)
	frame := func(eye geometry.Vec3) poseFrame {
		ms += 100
		var f poseFrame
		state, f = cfg.step(state, "", oc4Frame(lookAtY(eye, viewerTarget()), 0, ms, rng, 0.5), time.UnixMilli(ms))
		return f
	}
	here := eyeAt(0)
	for i := 0; i < 5; i++ {
		if f := frame(here); !f.ok {
			t.Fatal(f.reason)
		}
	}
	// one frame from the other side of the model: left out, the track stays
	other := viewerTarget().Add(viewerTarget().Sub(here))
	other[1] = here[1]
	if f := frame(other); f.ok || !strings.Contains(f.reason, "left out") {
		t.Fatalf("jump taken: %v", f.reason)
	}
	if f := frame(here); !f.ok {
		t.Fatalf("back on the track: %s", f.reason)
	}
	// three frames that agree: a real change
	frame(other)
	frame(other)
	f := frame(other)
	if !f.ok {
		t.Fatalf("confirmed change: %s", f.reason)
	}
	pos := f.result["camera"].(map[string]any)["position"].([]float64)
	if (geometry.Vec3{pos[0], pos[1], pos[2]}).Sub(other).Norm() > 0.1 {
		t.Fatalf("camera at %v, not %v", pos, other)
	}
	// after a gap, the first pose waits for a second one that agrees
	ms += 5000
	if f := frame(here); f.ok || !strings.Contains(f.reason, "track was lost") {
		t.Fatalf("after a gap: %v", f.reason)
	}
	if f := frame(here); !f.ok {
		t.Fatalf("second frame after a gap: %s", f.reason)
	}
	// with the check off, every pose is taken
	off, _ := parsePoseConfig(oc4Settings(map[string]any{"maxJumpDeg": 0.0}))
	cfg = off
	if f := frame(here); !f.ok {
		t.Fatal(f.reason)
	}
	if f := frame(other); !f.ok {
		t.Fatalf("check off: %s", f.reason)
	}
}
