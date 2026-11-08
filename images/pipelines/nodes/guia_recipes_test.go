package nodes

// The recipes of the nodes guide (guia/recetas/recipes_check.json, made by
// recipes.py): every node's settings parse, wires point to existing nodes
// and match the outputs, and every Function script compiles in goja. The
// heater recipe's control (signals -> thermostat, alarm lockout, setpoint)
// also runs through a scenario. Set GUIA_RECIPES to the json to run it.

import (
	"encoding/json"
	"math"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"

	fl "pipelines/function_library"
	"pipelines/geometry"
)

type guiaNode struct {
	Name       string                `json:"name"`
	NodeUid    string                `json:"nodeUid"`
	Type       string                `json:"type"`
	NumOutputs int                   `json:"numOutputs"`
	Settings   map[string]any        `json:"settings"`
	Wires      [][]map[string]string `json:"wires"`
}

func loadGuiaRecipes(t *testing.T) map[string][]guiaNode {
	path := os.Getenv("GUIA_RECIPES")
	if path == "" {
		t.Skip("GUIA_RECIPES not set")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]struct {
		Nodes []guiaNode `json:"nodes"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	out := map[string][]guiaNode{}
	for file, doc := range raw {
		out[file] = doc.Nodes
	}
	return out
}

func TestGuiaRecipesAreValid(t *testing.T) {
	resolve := func(ref string) (string, error) { return "subject." + ref, nil }
	for file, nodes := range loadGuiaRecipes(t) {
		uids := map[string]bool{}
		for _, n := range nodes {
			if uids[n.NodeUid] {
				t.Errorf("%s: repeated nodeUid %s", file, n.NodeUid)
			}
			uids[n.NodeUid] = true
		}
		for _, n := range nodes {
			where := file + ": " + n.Name
			if len(n.Wires) != n.NumOutputs {
				t.Errorf("%s: %d wire lists for %d outputs", where, len(n.Wires), n.NumOutputs)
			}
			for _, out := range n.Wires {
				for _, w := range out {
					if !uids[w["nodeEndUid"]] {
						t.Errorf("%s: wire to unknown node %s", where, w["nodeEndUid"])
					}
				}
			}
			var err error
			s := n.Settings
			switch n.Type {
			case "Alarm":
				_, err = parseAlarmConfig(n.Name, s)
			case "MachineState":
				_, err = parseMachineConfig(s, time.UTC)
			case "Totalizer":
				_, err = parseTotalizerConfig(s, time.UTC)
			case "Degradation":
				_, err = parseDegradationConfig(s, time.UTC)
			case "Anomaly":
				_, err = parseAnomalyConfig(s)
			case "Watchdog":
				_, err = parseWatchdogConfig(s, resolve)
			case "OEE":
				_, err = parseOeeConfig(s, time.UTC)
			case "Rainflow":
				_, err = parseRainflowConfig(s, time.UTC)
			case "Vibration":
				_, err = parseVibrationConfig(s)
			case "Approval":
				_, err = parseApprovalConfig(s)
			case "Deadband":
				_, err = parseDeadbandConfig(s)
			case "Window":
				_, err = parseWindowConfig(s)
			case "PoseEstimation":
				_, err = parsePoseConfig(s)
			case "AiTool":
				_, _, _, _, err = parseAiToolSettings(s)
			case "Function":
				script, _ := s["onMessageScript"].(string)
				_, err = goja.Compile(n.Name, script, false)
				if err == nil && !strings.Contains(script, "function process(") {
					t.Errorf("%s: no process function", where)
				}
			}
			if err != nil {
				t.Errorf("%s (%s): %v", where, n.Type, err)
			}
		}
	}
}

// ---- the heater recipe's control, run as the Function node runs it ----

// fakeKv behaves like function_library.KvStore: values go through JSON (as
// in the NATS KV), and a missing key gives the zero value.
type fakeKv struct{ data map[string][]byte }

func (k *fakeKv) SetValue(key string, v any) { b, _ := json.Marshal(v); k.data[key] = b }
func (k *fakeKv) DeleteEntry(key string)     { delete(k.data, key) }
func (k *fakeKv) GetNumberValue(key string) float64 {
	var f float64
	_ = json.Unmarshal(k.data[key], &f)
	return f
}
func (k *fakeKv) GetStringValue(key string) string {
	var s string
	_ = json.Unmarshal(k.data[key], &s)
	return s
}
func (k *fakeKv) GetBooleanValue(key string) bool {
	var b bool
	_ = json.Unmarshal(k.data[key], &b)
	return b
}
func (k *fakeKv) GetObjectValue(key string) map[string]any {
	b, ok := k.data[key]
	if !ok {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(b, &m) != nil {
		return nil
	}
	return m
}

// num is a number exported by goja (int64 when integral, float64 otherwise); -1e308 if none
func num(v any) float64 {
	switch x := v.(type) {
	case int64:
		return float64(x)
	case float64:
		return x
	}
	return -1e308
}

type fakeGo struct{ kv *fakeKv }

func (g *fakeGo) All() map[string]any { return map[string]any{"kvStore": g.kv} }

type heaterScripts struct {
	kv                                     *fakeKv
	signals, thermostat, lockout, setpoint *goja.Runtime
}

func runScript(t *testing.T, vm *goja.Runtime, payload map[string]any) any {
	t.Helper()
	process, ok := goja.AssertFunction(vm.Get("process"))
	if !ok {
		t.Fatal("no process")
	}
	msg := vm.NewObject()
	_ = msg.Set("payload", payload)
	res, err := process(goja.Undefined(), msg)
	if err != nil {
		t.Fatal(err)
	}
	if goja.IsNull(res) || goja.IsUndefined(res) {
		return nil
	}
	return res.Export()
}

func newHeaterScripts(t *testing.T, nodes []guiaNode) *heaterScripts {
	h := &heaterScripts{kv: &fakeKv{data: map[string][]byte{}}}
	load := func(name string) *goja.Runtime {
		for _, n := range nodes {
			if n.Name == name {
				vm := goja.New()
				_ = vm.Set("Go", func() *fakeGo { return &fakeGo{kv: h.kv} })
				if _, err := vm.RunString(n.Settings["onMessageScript"].(string)); err != nil {
					t.Fatalf("%s: %v", name, err)
				}
				return vm
			}
		}
		t.Fatalf("no node %q", name)
		return nil
	}
	h.signals = load("Señales del calentador")
	h.thermostat = load("Termostato y seguridad")
	h.lockout = load("Bloqueo por alarma")
	h.setpoint = load("Consigna y modo")
	return h
}

// reading runs a controller reading through signals and thermostat, and
// returns the signals' payload and the command (nil when none).
func (h *heaterScripts) reading(t *testing.T, at time.Time, temp float64, heater, levelOk bool, powerW float64) (map[string]any, map[string]any) {
	t.Helper()
	in := map[string]any{
		"temperature": temp, "heater": heater, "levelOk": levelOk,
		"powerW": powerW, "voltageV": 230.0, "energyKWh": 1.0, "timestamp": at.UTC().Format(time.RFC3339),
	}
	out := runScript(t, h.signals, in)
	if out == nil {
		t.Fatal("signals dropped a valid reading")
	}
	sig := out.(map[string]any)["payload"].(map[string]any)
	cmd := runScript(t, h.thermostat, sig)
	if cmd == nil {
		return sig, nil
	}
	return sig, cmd.(map[string]any)["payload"].(map[string]any)
}

func TestGuiaHeaterControl(t *testing.T) {
	recipes := loadGuiaRecipes(t)
	nodes, ok := recipes["09_calentador.yml"]
	if !ok {
		t.Fatal("no heater recipe")
	}
	h := newHeaterScripts(t, nodes)
	t0 := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)

	// default setpoint 60 °C, cold water, relay off -> turn on
	sig, cmd := h.reading(t, t0, 20, false, true, 0)
	if num(sig["setpoint"]) != 60 {
		t.Fatalf("default setpoint %v", sig["setpoint"])
	}
	if sig["mode"] != "off" || cmd == nil || cmd["heater"] != true {
		t.Fatalf("cold start: mode %v, command %v", sig["mode"], cmd)
	}
	// the same reading again 5 s later: no repeated order
	if _, cmd = h.reading(t, t0.Add(5*time.Second), 20, false, true, 0); cmd != nil {
		t.Fatalf("repeated order: %v", cmd)
	}

	// heating: mode, power health and heating rate (2 °C/min over 30 s)
	sig, cmd = h.reading(t, t0.Add(10*time.Second), 20, true, true, 950)
	if sig["mode"] != "heating" || cmd != nil {
		t.Fatalf("heating: %v %v", sig["mode"], cmd)
	}
	if ph := num(sig["powerHealth"]); ph != 95 {
		t.Fatalf("power health %v", ph)
	}
	if _, has := sig["heatingRate"]; has {
		t.Fatal("no rate before 30 s")
	}
	sig, _ = h.reading(t, t0.Add(40*time.Second), 21, true, true, 950)
	if r := num(sig["heatingRate"]); r != 2 {
		t.Fatalf("heating rate %v", sig["heatingRate"])
	}

	// near the setpoint: holding; at the setpoint: off; 2 °C below: on again
	sig, cmd = h.reading(t, t0.Add(60*time.Second), 58, true, true, 950)
	if sig["mode"] != "holding" || cmd != nil {
		t.Fatalf("holding: %v %v", sig["mode"], cmd)
	}
	if _, cmd = h.reading(t, t0.Add(65*time.Second), 60, true, true, 950); cmd == nil || cmd["heater"] != false {
		t.Fatalf("at setpoint: %v", cmd)
	}
	if _, cmd = h.reading(t, t0.Add(70*time.Second), 59, false, true, 0); cmd != nil {
		t.Fatalf("inside the hysteresis: %v", cmd)
	}
	if _, cmd = h.reading(t, t0.Add(75*time.Second), 58, false, true, 0); cmd == nil || cmd["heater"] != true {
		t.Fatalf("below the hysteresis: %v", cmd)
	}

	// dry: off at once, mode dry
	sig, cmd = h.reading(t, t0.Add(80*time.Second), 58, true, false, 950)
	if sig["mode"] != "dry" || cmd == nil || cmd["heater"] != false {
		t.Fatalf("dry: %v %v", sig["mode"], cmd)
	}

	// the dry alarm latches: the heater stays off when the level is back, until the reset
	runScript(t, h.lockout, map[string]any{"event": "raised", "alarm": "Resistencia en seco", "level": "Alarm"})
	runScript(t, h.lockout, map[string]any{"event": "latched", "alarm": "Resistencia en seco", "level": "Normal"})
	if _, cmd = h.reading(t, t0.Add(100*time.Second), 40, false, true, 0); cmd != nil {
		t.Fatalf("locked heater turned on: %v", cmd)
	}
	runScript(t, h.lockout, map[string]any{"event": "reset", "alarm": "Resistencia en seco", "level": "Normal"})
	if _, cmd = h.reading(t, t0.Add(105*time.Second), 40, false, true, 0); cmd == nil || cmd["heater"] != true {
		t.Fatalf("after the reset: %v", cmd)
	}
	// a warning does not lock
	runScript(t, h.lockout, map[string]any{"event": "raised", "alarm": "Sobretemperatura", "level": "Warning"})
	if h.kv.GetBooleanValue("heater_lock_overtemp") {
		t.Fatal("a warning locked the heater")
	}

	// hard limit at 90 °C, even with a higher setpoint
	h.kv.SetValue("heater_last_command", map[string]any{"heater": true, "at": 0})
	if _, cmd = h.reading(t, t0.Add(110*time.Second), 90, true, true, 950); cmd == nil || cmd["heater"] != false {
		t.Fatalf("hard limit: %v", cmd)
	}

	// setpoint from the viewer: valid, out of range, mode off
	res := runScript(t, h.setpoint, map[string]any{"setpoint": 45})
	if !strings.Contains(res.(map[string]any)["payload"].(map[string]any)["message"].(string), "45") || h.kv.GetNumberValue("heater_setpoint") != 45 {
		t.Fatalf("setpoint: %v", res)
	}
	res = runScript(t, h.setpoint, map[string]any{"setpoint": 95})
	if !strings.Contains(res.(map[string]any)["payload"].(map[string]any)["message"].(string), "rechazada") || h.kv.GetNumberValue("heater_setpoint") != 45 {
		t.Fatalf("out of range: %v", res)
	}
	runScript(t, h.setpoint, map[string]any{"mode": "off"})
	// the relay still on (more than 15 s after the last order): the mode shows what it does, and it is turned off
	h.kv.DeleteEntry("heater_last_command")
	sig, cmd = h.reading(t, t0.Add(200*time.Second), 20, true, true, 950)
	if sig["mode"] != "heating" || sig["enabled"] != false || cmd == nil || cmd["heater"] != false {
		t.Fatalf("disabled: %v %v %v", sig["mode"], sig["enabled"], cmd)
	}
	// once off, disabled and cold: off, and no order
	sig, cmd = h.reading(t, t0.Add(205*time.Second), 20, false, true, 0)
	if sig["mode"] != "off" || cmd != nil {
		t.Fatalf("disabled and off: %v %v", sig["mode"], cmd)
	}

	// a reading without temperature is dropped
	if runScript(t, h.signals, map[string]any{"heater": true}) != nil {
		t.Fatal("reading without temperature not dropped")
	}
}

func TestGuiaHeaterAnalysisOutputs(t *testing.T) {
	nodes := loadGuiaRecipes(t)["09_calentador.yml"]
	var script string
	for _, n := range nodes {
		if n.Name == "Solo con la resistencia encendida" {
			script = n.Settings["onMessageScript"].(string)
		}
	}
	vm := goja.New()
	if _, err := vm.RunString(script); err != nil {
		t.Fatal(err)
	}
	both := runScript(t, vm, map[string]any{"powerHealth": 95.0, "heatingRate": 2.0, "timestamp": "x"}).([]any)
	if len(both) != 2 || both[0] == nil || both[1] == nil {
		t.Fatalf("both: %v", both)
	}
	onlyHealth := runScript(t, vm, map[string]any{"powerHealth": 95.0}).([]any)
	if onlyHealth[0] == nil || onlyHealth[1] != nil {
		t.Fatalf("only health: %v", onlyHealth)
	}
	if runScript(t, vm, map[string]any{"temperature": 20.0}) != nil {
		t.Fatal("nothing to analyse must give null")
	}
}

// The RPi of the mock-up only sends {temperature, timestamp}: the simulator
// fills the rest, and the chain simulator -> signals -> thermostat works.
func TestGuiaHeaterSimulator(t *testing.T) {
	nodes := loadGuiaRecipes(t)["09_calentador.yml"]
	h := newHeaterScripts(t, nodes)
	var simScript string
	for _, n := range nodes {
		if n.Name == "Simulador de la maqueta" {
			simScript = n.Settings["onMessageScript"].(string)
		}
	}
	sim := goja.New()
	_ = sim.Set("Go", func() *fakeGo { return &fakeGo{kv: h.kv} })
	if _, err := sim.RunString(simScript); err != nil {
		t.Fatal(err)
	}
	t0 := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	rpi := func(at time.Time, temp float64) map[string]any {
		out := runScript(t, sim, map[string]any{"temperature": temp, "timestamp": at.Format(time.RFC3339)})
		if out == nil {
			t.Fatal("simulator dropped a reading")
		}
		return out.(map[string]any)["payload"].(map[string]any)
	}

	// flat temperature: heater off, no power, level ok, ~230 V, everything listed as simulated
	p := rpi(t0, 20)
	if p["heater"] != false || num(p["powerW"]) != 0 || p["levelOk"] != true {
		t.Fatalf("first reading: %v", p)
	}
	if v := num(p["voltageV"]); v < 226 || v > 234 {
		t.Fatalf("voltage %v", v)
	}
	if len(p["simulated"].([]any)) != 5 {
		t.Fatalf("simulated %v", p["simulated"])
	}

	// rising 2 °C/min: after 20 s the heater is on, with ~1000 W
	var temp float64 = 20
	for i := 1; i <= 6; i++ {
		temp += 2.0 / 12 // 5 s steps
		p = rpi(t0.Add(time.Duration(i*5)*time.Second), temp)
	}
	if p["heater"] != true {
		t.Fatalf("heater not detected: %v", p)
	}
	if w := num(p["powerW"]); w < 950 || w > 1050 {
		t.Fatalf("power %v", w)
	}
	// energy grows while on (1000 W for 5 s = 0.0014 kWh)
	e1 := num(p["energyKWh"])
	p = rpi(t0.Add(35*time.Second), temp+2.0/12)
	if e2 := num(p["energyKWh"]); e2 <= e1 {
		t.Fatalf("energy %v -> %v", e1, e2)
	}

	// through signals and thermostat: heating mode, health ~100 %, the order repeats only every 5 min
	sig := runScript(t, h.signals, p).(map[string]any)["payload"].(map[string]any)
	if sig["mode"] != "heating" || num(sig["powerHealth"]) < 98 {
		t.Fatalf("signals: %v %v", sig["mode"], sig["powerHealth"])
	}
	h.kv.SetValue("heater_mode", "off") // the thermostat wants it off: the simulated relay does not obey
	sig = runScript(t, h.signals, p).(map[string]any)["payload"].(map[string]any)
	if runScript(t, h.thermostat, sig) == nil {
		t.Fatal("no order")
	}
	if runScript(t, h.thermostat, sig) != nil {
		t.Fatal("order repeated before 5 min with a simulated relay")
	}
	h.kv.SetValue("heater_mode", "auto")

	// flat again: off after the next window
	for i := 8; i <= 14; i++ {
		p = rpi(t0.Add(time.Duration(i*5)*time.Second), temp)
	}
	if p["heater"] != false || num(p["powerW"]) != 0 {
		t.Fatalf("heater not off: %v", p)
	}

	// demo commands from the viewer: low level, faster aging, real fields win
	runScript(t, h.setpoint, map[string]any{"simulate": map[string]any{"level": "low", "agingPerDay": 5.0}})
	p = rpi(t0.Add(80*time.Second), temp)
	if p["levelOk"] != false {
		t.Fatal("low level not simulated")
	}
	if a := h.kv.GetObjectValue("sim_aging"); a == nil || num(a["perDay"]) != 5 && a["perDay"] != 5.0 {
		t.Fatalf("aging %v", a)
	}
	real := runScript(t, sim, map[string]any{"temperature": 30.0, "heater": true, "levelOk": true, "powerW": 800.0,
		"timestamp": t0.Add(85 * time.Second).Format(time.RFC3339)}).(map[string]any)["payload"].(map[string]any)
	if real["heater"] != true || real["levelOk"] != true || num(real["powerW"]) != 800 {
		t.Fatalf("real fields overwritten: %v", real)
	}
	if s := real["simulated"].([]any); len(s) != 2 {
		t.Fatalf("only voltage and energy are simulated: %v", s)
	}

	// 10 days later at 5 %/day: health ~50 % (the floor)
	runScript(t, h.setpoint, map[string]any{"simulate": map[string]any{"level": "ok"}})
	for i := 0; i < 6; i++ {
		temp += 2.0 / 12
		p = rpi(t0.Add(10*24*time.Hour+time.Duration(i*5)*time.Second), temp)
	}
	if w := num(p["powerW"]); w < 450 || w > 560 {
		t.Fatalf("aged power %v", w)
	}
}

// ---- the OC4 recipe: detections -> Pose estimation -> viewer, as the nodes run them ----

// fakeYolo returns the detections a perfect YOLO-pose would give, as the Go
// structs that function_library's PostprocessPose returns.
type fakeYolo struct{ dets []fl.PoseDetection }

func (y *fakeYolo) PostprocessPose(output []float32, opts map[string]any) []fl.PoseDetection {
	return y.dets
}

type fakeLog struct{}

func (fakeLog) Warnf(string, ...any) {}
func (fakeLog) Infof(string, ...any) {}

type fakeGoYolo struct {
	yolo *fakeYolo
	kv   *fakeKv
}

func (g *fakeGoYolo) All() map[string]any {
	return map[string]any{"yolo": g.yolo, "log": fakeLog{}, "kvStore": g.kv}
}

func TestGuiaOC4Chain(t *testing.T) {
	recipes := loadGuiaRecipes(t)
	nodes := recipes["10_oc4_pose.yml"]
	byName := map[string]guiaNode{}
	for _, n := range nodes {
		byName[n.Name] = n
	}
	yolo := &fakeYolo{}
	kv := &fakeKv{data: map[string][]byte{}}
	load := func(name string) *goja.Runtime {
		vm := goja.New()
		_ = vm.Set("Go", func() *fakeGoYolo { return &fakeGoYolo{yolo: yolo, kv: kv} })
		if _, err := vm.RunString(byName[name].Settings["onMessageScript"].(string)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		return vm
	}
	keypointsVM := load("Detecciones y keypoints")
	viewerVM := load("Al visor")
	measureVM := load("Medidas del rotor")
	cameraToolVM := load("Cámara del visor")
	viewToViewerVM := load("Vista al visor")
	cfg, err := parsePoseConfig(byName["Pose de la cámara y rotor"].Settings)
	if err != nil {
		t.Fatal(err)
	}

	// the keypoint order the recipe gives the model's outputs
	var byClass map[string][]string
	if err := json.Unmarshal([]byte(byName["Pose de la cámara y rotor"].Settings["keypointNamesByClass"].(string)), &byClass); err != nil {
		t.Fatal(err)
	}
	// frames of 1080x1920 (a phone in portrait), with the field of view the recipe assumes: 68° on the long side
	const w, h = 1080.0, 1920.0
	f := h / 2 / math.Tan(68*math.Pi/360)
	cam := geometry.Camera{Fx: f, Fy: f, Cx: w / 2, Cy: h / 2}
	// the rotor of OC4.glb: hub of the rotate node, axis +Z, blades at 330° (red), 90° (blue), 210° (yellow) from +X
	hub := geometry.Vec3{0.00095, 1.145, -0.2576}
	rest := map[string]float64{"red": 330, "blue": 90, "yellow": 210}
	var state *poseState
	var lastViewer, lastMeasure map[string]any
	for i := 0; i < 50; i++ {
		tm := float64(i) / 10
		ms := int64(1_700_000_000_000 + tm*1000)
		pose := lookAtY(eyeAt(tm), viewerTarget())
		rotor := -2 * math.Pi * tm
		kp := func(p geometry.Vec3) fl.PoseKeypoint {
			u, v, _ := cam.Project(pose.Apply(p))
			return fl.PoseKeypoint{X: u, Y: v, Conf: 0.9}
		}
		turbine := fl.PoseDetection{Label: "WindTurbine", Confidence: 0.9}
		for _, n := range byClass["WindTurbine"] {
			turbine.Keypoints = append(turbine.Keypoints, kp(geometry.BlenderToGLTF(geometry.Vec3(oc4Blender[n]))))
		}
		blades := fl.PoseDetection{Label: "Rotor", Confidence: 0.8}
		for _, n := range byClass["Rotor"] {
			if n == "" {
				blades.Keypoints = append(blades.Keypoints, fl.PoseKeypoint{}) // padding slot
				continue
			}
			parts := strings.Split(n, "_") // blade_<colour>_<1|2>
			a := rest[parts[1]]*math.Pi/180 + rotor
			r := 0.25
			if parts[2] == "2" {
				r = 0.55
			}
			blades.Keypoints = append(blades.Keypoints, kp(hub.Add(geometry.Vec3{math.Cos(a), math.Sin(a), 0}.Scale(r))))
		}
		yolo.dets = []fl.PoseDetection{blades, turbine}

		out := runScript(t, keypointsVM, map[string]any{
			"letterbox":      map[string]any{"scale": 0.33, "padX": 0.0, "padY": 0.0, "width": w, "height": h},
			"mlmOutput":      []float32{0},
			"frameTimestamp": float64(ms),
		})
		payload := out.(map[string]any)["payload"].(map[string]any)
		next, frame := cfg.step(state, "dev2dtm", payload, time.UnixMilli(ms))
		if !frame.ok {
			t.Fatalf("frame %d: %s", i, frame.reason)
		}
		state = next
		// what the node sends on output 0
		payload[cfg.ResultField] = frame.result
		payload["camera"] = frame.camera
		payload["customAnimation"] = frame.animated
		lastViewer, _ = runScript(t, viewerVM, payload).(map[string]any)
		lastMeasure, _ = runScript(t, measureVM, payload).(map[string]any)
	}
	viewer := lastViewer["payload"].(map[string]any)
	if viewer["camera"] == nil || viewer["customAnimation"].(map[string]any)["rotate"] == nil {
		t.Fatalf("viewer payload %v", viewer)
	}

	// the assistant's tool: one Function answers it (Publish Reply), another sends the view to the viewer (dtm2sim)
	tool := func(args map[string]any) (map[string]any, map[string]any) {
		reply := runScript(t, cameraToolVM, args).(map[string]any)["payload"].(map[string]any)
		var viewer map[string]any
		if out := runScript(t, viewToViewerVM, args); out != nil {
			viewer = out.(map[string]any)["payload"].(map[string]any)
		}
		return reply, viewer
	}
	status, toViewer := tool(map[string]any{"action": "status"})
	if status["mode"] != "follow_phone" || status["phoneStreaming"] != true || status["lastPose"] == nil || toViewer != nil {
		t.Fatalf("status %v %v", status, toViewer)
	}
	if pose := status["lastPose"].(map[string]any); pose["phonePosition"] == nil || pose["rotorRpm"] == nil {
		t.Fatalf("last pose %v", pose)
	}
	// a view: shown at once (with or without the phone), and the phone's poses no longer move the camera
	top, toViewer := tool(map[string]any{"action": "view", "view": "top"})
	if top["mode"] != "free" || toViewer == nil {
		t.Fatalf("view %v %v", top, toViewer)
	}
	if cam := toViewer["camera"].(map[string]any); cam["view"] != "top" || cam["follow"] != false {
		t.Fatalf("camera %v", cam)
	}
	if bad, toViewer := tool(map[string]any{"action": "view", "view": "sideways"}); bad["ok"] != false || toViewer != nil {
		t.Fatalf("bad view %v", bad)
	}
	frameOut := func() map[string]any {
		in := map[string]any{"pose": samplePoseResult(), "camera": map[string]any{"position": []any{1.0, 1.0, 1.0}},
			"customAnimation": map[string]any{"Rotor": map[string]any{"quaternion": []any{0.0, 0.0, 0.0, 1.0}}}, "timestamp": 1.0}
		return runScript(t, viewerVM, in).(map[string]any)["payload"].(map[string]any)
	}
	if out := frameOut(); out["camera"] != nil || out["customAnimation"] == nil {
		t.Fatalf("free mode sends %v", out)
	}
	runScript(t, cameraToolVM, map[string]any{"action": "follow_phone"})
	if out := frameOut(); out["camera"] == nil {
		t.Fatalf("follow mode sends %v", out)
	}
	if _, has := viewer["detections"]; has {
		t.Fatal("the viewer gets the detections")
	}
	rpm := num(lastMeasure["payload"].(map[string]any)["rotorRpm"])
	if math.Abs(rpm+60) > 3 {
		t.Fatalf("rpm %v, want -60", rpm)
	}
}

// samplePoseResult: a pose result as the Pose estimation node puts it in the payload (output 0)
func samplePoseResult() map[string]any {
	return map[string]any{
		"ok": true, "distance": 2.0, "reprojectionError": 0.5,
		"camera": map[string]any{"position": []any{1.0, 1.0, 1.0}, "quaternion": []any{0.0, 0.0, 0.0, 1.0}},
		"parts":  map[string]any{"rotor": map[string]any{"ready": true, "rpm": -60.0, "angle": 10.0}},
	}
}

