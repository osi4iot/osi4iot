package nodes

// Pose estimation node logic: the pose of a calibrated camera with respect to
// a known rigid object, from named 2D keypoints (a YOLO-pose model, ArUco
// corners, ...) and the 3D points of the object (geometry.SolvePnP).
//
// Two modes:
//   - "camera": the object stands still and the camera moves (a phone walked
//     around a model). The output is the camera's pose in the object's frame,
//     which is the viewer's when the 3D points are in the glb's coordinates:
//     payload.camera drives the 3D viewer's camera.
//   - "object": the camera stands still and the object moves (a floating
//     platform filmed from a tripod). The output is the motion of the object
//     since the first pose (or the last reset): position, quaternion, angles.
//
// Moving parts (a rotor, a sliding door): their keypoints are left out of the
// PnP and give, with the pose, the angle around an axis or the displacement
// along one. A rotation with n-fold symmetry (3 blades) is unwrapped across
// frames with a Kalman filter of the angle and its rate.

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"pipelines/geometry"
)

type poseKeypoint struct {
	U, V, Conf float64
}

type posePart struct {
	Name      string
	Type      string // "rotation" or "translation"
	Keypoints []string
	Rest      map[string]geometry.Vec3
	Origin    geometry.Vec3 // rotation: a point of the axis
	Axis      geometry.Vec3 // unit
	E1, E2    geometry.Vec3
	RestAngle map[string]float64
	Symmetry  int
	Direction int     // +1, -1, 0: either
	Expected  float64 // expected rate (rad/s or m/s), 0: unknown
	MaxAccel  float64 // rad/s^2 or m/s^2
	Noise     float64 // of one keypoint's measurement, rad or m
	NodeName  string  // glb node moved by customAnimation
	NodePos   geometry.Vec3
}

type poseConfig struct {
	Mode          string // "camera" or "object"
	InputPath     string
	KeypointNames []string
	ClassName     string
	NamesByClass  map[string][]string // class -> its keypoints in the model's order
	MinConfidence float64
	Points        map[string]geometry.Vec3 // all the named points, viewer frame
	PosePoints    map[string]geometry.Vec3 // those of the rigid body
	Parts         []*posePart
	Calibration   *geometry.Camera
	CalibW        float64
	CalibH        float64
	FovDeg        float64 // without calibration: field of view of FovSide
	FovSide       string  // "vertical", "horizontal" or "long" (the longer side: the same in portrait and landscape)
	WidthPath     string
	HeightPath    string
	InlierPx      float64
	MinPoints     int
	Smoothing     bool
	Noise         geometry.PoseNoise
	// the position of a pose is less sure the further the camera: its noise is
	// Noise.Position + NoiseRelative * distance
	NoiseRelative float64
	ResetAfter    time.Duration
	// a pose further than this from the previous one (degrees; a fraction of the
	// distance) is left out until ConfirmFrames frames agree; 0: no check
	MaxJumpDeg    float64
	MaxJump       float64
	ConfirmFrames int
	TimePath      string
	KeyPath       string
	ResultField   string
	Viewer        bool // add payload.camera / payload.customAnimation
	Follow        bool
	ObjectNode    string
	ObjectNodePos geometry.Vec3
	Warnings      []string // found while reading the settings
}

// ---- settings ----

// jsonSetting reads a setting that is a JSON value or a JSON text.
func jsonSetting(settings map[string]any, key string) (any, error) {
	v, ok := settings[key]
	if !ok || v == nil {
		return nil, nil
	}
	if text, isText := v.(string); isText {
		text = strings.TrimSpace(text)
		if text == "" {
			return nil, nil
		}
		var out any
		if err := json.Unmarshal([]byte(text), &out); err != nil {
			return nil, fmt.Errorf("%s is not valid JSON: %w", key, err)
		}
		return out, nil
	}
	return v, nil
}

// numbers reads [1, 2, 3], [[1], [2]] (nested lists are flattened) or
// {"data": [...]} (OpenCV's matrices saved as JSON).
func numbers(v any) []float64 {
	switch x := v.(type) {
	case []any:
		var out []float64
		for _, item := range x {
			if n, ok := toNumber(item); ok {
				out = append(out, n)
			} else {
				out = append(out, numbers(item)...)
			}
		}
		return out
	case map[string]any:
		if d, ok := x["data"]; ok {
			return numbers(d)
		}
	}
	return nil
}

func vec3Of(v any) (geometry.Vec3, bool) {
	if m, ok := v.(map[string]any); ok {
		x, okx := toNumber(m["x"])
		y, oky := toNumber(m["y"])
		z, okz := toNumber(m["z"])
		return geometry.Vec3{x, y, z}, okx && oky && okz
	}
	n := numbers(v)
	if len(n) != 3 {
		return geometry.Vec3{}, false
	}
	return geometry.Vec3{n[0], n[1], n[2]}, true
}

// parsePoints reads {"name": [x, y, z] | {x, y, z}} or [{name, x, y, z}].
func parsePoints(v any) (map[string]geometry.Vec3, error) {
	out := map[string]geometry.Vec3{}
	switch x := v.(type) {
	case map[string]any:
		for name, p := range x {
			vec, ok := vec3Of(p)
			if !ok {
				return nil, fmt.Errorf("point %q is not [x, y, z]", name)
			}
			out[name] = vec
		}
	case []any:
		for i, item := range x {
			m, ok := item.(map[string]any)
			name, _ := m["name"].(string)
			vec, okv := vec3Of(m)
			if !ok || name == "" || !okv {
				return nil, fmt.Errorf("point %d is not {name, x, y, z}", i+1)
			}
			out[name] = vec
		}
	case nil:
	default:
		return nil, fmt.Errorf("points must be an object {name: [x, y, z]} or a list of {name, x, y, z}")
	}
	return out, nil
}

func firstOf(m map[string]any, keys ...string) (any, bool) {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v, true
		}
	}
	return nil, false
}

// parseCalibration reads OpenCV's calibration in the usual JSON shapes:
// camera_matrix (3x3, nested, flat or {data}) and dist_coeffs, or fx, fy,
// cx, cy and dist; the image size of the calibration as image_width and
// image_height, or image_size / resolution [w, h].
func parseCalibration(v any) (*geometry.Camera, float64, float64, []string, error) {
	m, ok := v.(map[string]any)
	if !ok {
		return nil, 0, 0, nil, fmt.Errorf("calibration must be a JSON object")
	}
	var warnings []string
	cam := &geometry.Camera{}
	if k, ok := firstOf(m, "camera_matrix", "cameraMatrix", "intrinsic_matrix", "intrinsicMatrix", "K", "mtx", "intrinsics", "matrix"); ok {
		n := numbers(k)
		if len(n) != 9 {
			return nil, 0, 0, nil, fmt.Errorf("the camera matrix must have 9 numbers, it has %d", len(n))
		}
		cam.Fx, cam.Cx, cam.Fy, cam.Cy = n[0], n[2], n[4], n[5]
	} else {
		for key, dst := range map[string]*float64{"fx": &cam.Fx, "fy": &cam.Fy, "cx": &cam.Cx, "cy": &cam.Cy} {
			n, ok := toNumber(m[key])
			if !ok {
				return nil, 0, 0, nil, fmt.Errorf("calibration without camera_matrix nor %s", key)
			}
			*dst = n
		}
	}
	if cam.Fx <= 0 || cam.Fy <= 0 {
		return nil, 0, 0, nil, fmt.Errorf("the focal lengths must be positive")
	}
	if d, ok := firstOf(m, "dist_coeffs", "distCoeffs", "dist_coeff", "dist", "distortion", "distortion_coefficients", "distortionCoefficients", "D"); ok {
		n := numbers(d)
		for i := 0; i < len(n) && i < 5; i++ {
			cam.Dist[i] = n[i]
		}
		for i := 5; i < len(n); i++ {
			if n[i] != 0 {
				warnings = append(warnings, "the calibration has more than 5 distortion coefficients (rational model): only k1, k2, p1, p2, k3 are used")
				break
			}
		}
	}
	var w, h float64
	if size, ok := firstOf(m, "image_size", "imageSize", "resolution", "size"); ok {
		if n := numbers(size); len(n) == 2 {
			w, h = n[0], n[1]
		} else if sm, ok := size.(map[string]any); ok {
			w, _ = toNumber(sm["width"])
			h, _ = toNumber(sm["height"])
		}
	}
	if x, ok := firstOf(m, "image_width", "imageWidth", "width", "img_width"); ok {
		w, _ = toNumber(x)
	}
	if x, ok := firstOf(m, "image_height", "imageHeight", "height", "img_height"); ok {
		h, _ = toNumber(x)
	}
	return cam, w, h, warnings, nil
}

func parsePoseConfig(settings map[string]any) (*poseConfig, error) {
	cfg := &poseConfig{
		Mode:          strings.ToLower(settingString(settings, "mode", "camera")),
		InputPath:     settingString(settings, "inputPath", "payload.detections"),
		KeypointNames: settingStrings(settings, "keypointNames"),
		ClassName:     settingString(settings, "className", ""),
		MinConfidence: settingNumber(settings, "minConfidence", 0.5),
		FovDeg:        settingNumber(settings, "fovDeg", 60),
		FovSide:       strings.ToLower(settingString(settings, "fovSide", "vertical")),
		WidthPath:     settingString(settings, "imageWidthPath", "payload.width"),
		HeightPath:    settingString(settings, "imageHeightPath", "payload.height"),
		InlierPx:      settingNumber(settings, "inlierThreshold", 8),
		MinPoints:     int(settingNumber(settings, "minPoints", 6)),
		Smoothing:     settingBool(settings, "smoothing", true),
		Noise: geometry.PoseNoise{
			Position:            settingNumber(settings, "positionNoise", 0.01),
			Angle:               settingNumber(settings, "angleNoiseDeg", 1) * math.Pi / 180,
			Acceleration:        settingNumber(settings, "maxAcceleration", 2),
			AngularAcceleration: settingNumber(settings, "maxAngularAccelerationDeg", 180) * math.Pi / 180,
		},
		ResetAfter:    time.Duration(settingNumber(settings, "resetAfter", 2) * float64(time.Second)),
		NoiseRelative: settingNumber(settings, "positionNoiseRelative", 0.05),
		MaxJumpDeg:    settingNumber(settings, "maxJumpDeg", 30),
		MaxJump:       settingNumber(settings, "maxJump", 0.3),
		ConfirmFrames: int(settingNumber(settings, "confirmFrames", 3)),
		TimePath:      timePathSetting(settings),
		KeyPath:       settingString(settings, "keyPath", ""),
		ResultField:   settingString(settings, "resultField", "pose"),
		Viewer:        settingBool(settings, "viewerOutput", true),
		Follow:        settingBool(settings, "follow", true),
		ObjectNode:    settingString(settings, "objectNodeName", ""),
	}
	if cfg.Mode != "camera" && cfg.Mode != "object" {
		return nil, fmt.Errorf("mode must be camera or object")
	}
	if cfg.MinConfidence < 0 || cfg.MinConfidence > 1 {
		return nil, fmt.Errorf("minConfidence must be between 0 and 1")
	}
	if cfg.InlierPx <= 0 {
		return nil, fmt.Errorf("inlierThreshold must be positive")
	}
	if cfg.NoiseRelative < 0 {
		return nil, fmt.Errorf("positionNoiseRelative cannot be negative")
	}
	if cfg.MaxJumpDeg < 0 || cfg.MaxJump < 0 {
		return nil, fmt.Errorf("maxJumpDeg and maxJump cannot be negative")
	}
	if cfg.ConfirmFrames < 1 {
		cfg.ConfirmFrames = 1
	}
	if cfg.MinPoints < 4 {
		cfg.MinPoints = 4
	}
	if cfg.FovSide != "vertical" && cfg.FovSide != "horizontal" && cfg.FovSide != "long" {
		return nil, fmt.Errorf("fovSide must be vertical, horizontal or long")
	}
	if cfg.FovDeg <= 1 || cfg.FovDeg >= 170 {
		return nil, fmt.Errorf("fovDeg must be between 1 and 170")
	}
	if cfg.Noise.Position <= 0 || cfg.Noise.Angle <= 0 || cfg.Noise.Acceleration <= 0 || cfg.Noise.AngularAcceleration <= 0 {
		return nil, fmt.Errorf("the smoothing noises must be positive")
	}
	frame := strings.ToLower(settingString(settings, "pointsFrame", "gltf"))
	if frame != "gltf" && frame != "blender" {
		return nil, fmt.Errorf("pointsFrame must be gltf or blender")
	}
	scale := settingNumber(settings, "pointsScale", 1)
	if scale <= 0 {
		return nil, fmt.Errorf("pointsScale must be positive")
	}
	toViewer := func(p geometry.Vec3) geometry.Vec3 {
		p = p.Scale(scale)
		if frame == "blender" {
			return geometry.BlenderToGLTF(p)
		}
		return p
	}
	dirToViewer := func(p geometry.Vec3) geometry.Vec3 {
		if frame == "blender" {
			return geometry.BlenderToGLTF(p)
		}
		return p
	}

	rawPoints, err := jsonSetting(settings, "points")
	if err != nil {
		return nil, err
	}
	pts, err := parsePoints(rawPoints)
	if err != nil {
		return nil, err
	}
	cfg.Points = map[string]geometry.Vec3{}
	for name, p := range pts {
		cfg.Points[name] = toViewer(p)
	}

	rawParts, err := jsonSetting(settings, "parts")
	if err != nil {
		return nil, err
	}
	partList, _ := rawParts.([]any)
	if rawParts != nil && partList == nil {
		return nil, fmt.Errorf("parts must be a list")
	}
	inPart := map[string]string{}
	for i, item := range partList {
		pm, ok := item.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("part %d is not an object", i+1)
		}
		part, err := parsePosePart(pm, cfg.Points, toViewer, dirToViewer)
		if err != nil {
			return nil, fmt.Errorf("part %d: %w", i+1, err)
		}
		for _, k := range part.Keypoints {
			if other, dup := inPart[k]; dup {
				return nil, fmt.Errorf("keypoint %q is in parts %q and %q", k, other, part.Name)
			}
			inPart[k] = part.Name
		}
		cfg.Parts = append(cfg.Parts, part)
	}
	exclude := map[string]bool{}
	for _, name := range settingStrings(settings, "excludeFromPose") {
		exclude[name] = true
	}
	cfg.PosePoints = map[string]geometry.Vec3{}
	for name, p := range cfg.Points {
		if inPart[name] == "" && !exclude[name] {
			cfg.PosePoints[name] = p
		}
	}
	if len(cfg.PosePoints) < 4 {
		return nil, fmt.Errorf("at least 4 points of the rigid body are needed (not in a moving part), there are %d", len(cfg.PosePoints))
	}
	if len(cfg.PosePoints) < cfg.MinPoints {
		return nil, fmt.Errorf("minPoints is %d but the rigid body has %d points", cfg.MinPoints, len(cfg.PosePoints))
	}
	rawByClass, err := jsonSetting(settings, "keypointNamesByClass")
	if err != nil {
		return nil, err
	}
	if rawByClass != nil {
		m, ok := rawByClass.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("keypointNamesByClass must be an object {class: [names in the model's order]}")
		}
		cfg.NamesByClass = map[string][]string{}
		for class, list := range m {
			// positions matter: a skipped keypoint is "" (or null)
			items, _ := list.([]any)
			names := make([]string, len(items))
			for i, item := range items {
				if text, ok := item.(string); ok {
					names[i] = strings.TrimSpace(text)
				}
			}
			if len(names) == 0 {
				return nil, fmt.Errorf("keypointNamesByClass: class %q has no names", class)
			}
			cfg.NamesByClass[class] = names
		}
	}
	if len(cfg.KeypointNames) > 0 {
		known := 0
		for _, name := range cfg.KeypointNames {
			if _, ok := cfg.Points[name]; ok {
				known++
			}
		}
		if known == 0 {
			return nil, fmt.Errorf("none of keypointNames has a 3D point")
		}
	}

	rawCal, err := jsonSetting(settings, "calibration")
	if err != nil {
		return nil, err
	}
	if rawCal != nil {
		cam, w, h, warnings, err := parseCalibration(rawCal)
		if err != nil {
			return nil, fmt.Errorf("calibration: %w", err)
		}
		cfg.Calibration, cfg.CalibW, cfg.CalibH = cam, w, h
		cfg.Warnings = append(cfg.Warnings, warnings...)
	}
	if v, ok := settings["calibrationWidth"]; ok {
		if n, ok := toNumber(v); ok && n > 0 {
			cfg.CalibW = n
		}
	}
	if v, ok := settings["calibrationHeight"]; ok {
		if n, ok := toNumber(v); ok && n > 0 {
			cfg.CalibH = n
		}
	}
	if raw, err := jsonSetting(settings, "objectNodePosition"); err == nil && raw != nil {
		p, ok := vec3Of(raw)
		if !ok {
			return nil, fmt.Errorf("objectNodePosition is not [x, y, z]")
		}
		cfg.ObjectNodePos = p // the node's position in the viewer: no frame conversion
	}
	return cfg, nil
}

func parsePosePart(pm map[string]any, points map[string]geometry.Vec3, toViewer, dirToViewer func(geometry.Vec3) geometry.Vec3) (*posePart, error) {
	part := &posePart{
		Name:      settingString(pm, "name", ""),
		Type:      strings.ToLower(settingString(pm, "type", "rotation")),
		Keypoints: settingStrings(pm, "keypoints"),
		Rest:      map[string]geometry.Vec3{},
		RestAngle: map[string]float64{},
		Symmetry:  int(settingNumber(pm, "symmetry", 1)),
		NodeName:  settingString(pm, "nodeName", ""),
	}
	if part.Name == "" {
		return nil, fmt.Errorf("a part needs a name")
	}
	if part.Type != "rotation" && part.Type != "translation" {
		return nil, fmt.Errorf("type must be rotation or translation")
	}
	if len(part.Keypoints) == 0 {
		return nil, fmt.Errorf("a part needs keypoints")
	}
	// a rotation may give the angles at rest instead of the 3D points
	restAngles := map[string]float64{}
	if raw, ok := pm["restAngles"]; ok && raw != nil {
		m, ok := raw.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("restAngles must be an object {keypoint: degrees}")
		}
		for k, v := range m {
			deg, ok := toNumber(v)
			if !ok {
				return nil, fmt.Errorf("restAngles: %q is not a number", k)
			}
			restAngles[k] = deg * math.Pi / 180
		}
	}
	for _, k := range part.Keypoints {
		if _, hasAngle := restAngles[k]; hasAngle && part.Type == "rotation" {
			continue
		}
		p, ok := points[k]
		if !ok {
			return nil, fmt.Errorf("keypoint %q has no 3D point (its position at rest) nor rest angle", k)
		}
		part.Rest[k] = p
	}
	axisRaw, ok := pm["axisDirection"]
	if !ok {
		return nil, fmt.Errorf("axisDirection is needed")
	}
	axis, ok := vec3Of(axisRaw)
	if !ok || axis.Norm() < 1e-9 {
		return nil, fmt.Errorf("axisDirection is not a non-zero [x, y, z]")
	}
	part.Axis = dirToViewer(axis).Unit()
	switch d := strings.ToLower(settingString(pm, "direction", "any")); d {
	case "any":
	case "positive", "+", "ccw":
		part.Direction = 1
	case "negative", "-", "cw":
		part.Direction = -1
	default:
		return nil, fmt.Errorf("direction must be any, positive or negative")
	}
	if part.Type == "rotation" {
		if part.Symmetry < 1 {
			part.Symmetry = 1
		}
		switch o := pm["axisOrigin"].(type) {
		case string:
			p, ok := points[o]
			if !ok {
				return nil, fmt.Errorf("axisOrigin %q is not a point", o)
			}
			part.Origin = p
		case nil:
			return nil, fmt.Errorf("axisOrigin is needed (a point name or [x, y, z])")
		default:
			p, ok := vec3Of(o)
			if !ok {
				return nil, fmt.Errorf("axisOrigin is not a point name nor [x, y, z]")
			}
			part.Origin = toViewer(p)
		}
		part.E1, part.E2 = geometry.PlaneBasis(part.Axis)
		if raw, ok := pm["zeroDirection"]; ok && raw != nil {
			// the direction of angle 0, in the plane of the rotation
			z, ok := vec3Of(raw)
			if !ok {
				return nil, fmt.Errorf("zeroDirection is not [x, y, z]")
			}
			z = dirToViewer(z)
			inPlane := z.Sub(part.Axis.Scale(z.Dot(part.Axis)))
			if inPlane.Norm() < 1e-6 {
				return nil, fmt.Errorf("zeroDirection is along the axis")
			}
			part.E1 = inPlane.Unit()
			part.E2 = part.Axis.Cross(part.E1)
		} else if len(restAngles) > 0 {
			return nil, fmt.Errorf("restAngles need zeroDirection (where 0° is)")
		}
		for k, a := range restAngles {
			part.RestAngle[k] = a
		}
		for k, p := range part.Rest {
			d := p.Sub(part.Origin)
			radial := d.Sub(part.Axis.Scale(d.Dot(part.Axis)))
			if radial.Norm() < 1e-6 {
				return nil, fmt.Errorf("keypoint %q is on the axis: it does not show the angle", k)
			}
			part.RestAngle[k] = geometry.AngleAround(p, part.Origin, part.E1, part.E2)
		}
		part.Expected = settingNumber(pm, "expectedSpeed", 0) // rad/s
		if part.Direction != 0 {
			// with a direction, the speed is its size
			part.Expected = float64(part.Direction) * math.Abs(part.Expected)
		}
		part.MaxAccel = settingNumber(pm, "maxAcceleration", 3)
		part.Noise = settingNumber(pm, "noiseDeg", 3) * math.Pi / 180
	} else {
		part.Symmetry = 1
		part.Expected = settingNumber(pm, "expectedSpeed", 0) // m/s
		if part.Direction != 0 {
			part.Expected = float64(part.Direction) * math.Abs(part.Expected)
		}
		part.MaxAccel = settingNumber(pm, "maxAcceleration", 1)
		part.Noise = settingNumber(pm, "noise", 0.005)
	}
	if part.MaxAccel <= 0 || part.Noise <= 0 {
		return nil, fmt.Errorf("maxAcceleration and the noise must be positive")
	}
	if raw, ok := pm["nodePosition"]; ok {
		p, ok := vec3Of(raw)
		if !ok {
			return nil, fmt.Errorf("nodePosition is not [x, y, z]")
		}
		part.NodePos = p
	}
	return part, nil
}

// ---- keypoints of a message ----

func keypointOf(v any) (poseKeypoint, bool) {
	switch x := v.(type) {
	case map[string]any:
		u, oku := toNumber(x["x"])
		vv, okv := toNumber(x["y"])
		if !oku || !okv {
			return poseKeypoint{}, false
		}
		conf := 1.0
		if c, ok := firstOf(x, "conf", "confidence", "score", "visibility", "v"); ok {
			if n, ok := toNumber(c); ok {
				conf = n
			}
		}
		return poseKeypoint{U: u, V: vv, Conf: conf}, true
	case []any:
		n := numbers(x)
		if len(n) < 2 {
			return poseKeypoint{}, false
		}
		conf := 1.0
		if len(n) >= 3 {
			conf = n[2]
		}
		return poseKeypoint{U: n[0], V: n[1], Conf: conf}, true
	}
	return poseKeypoint{}, false
}

func indexedKeypoints(list []any, names []string, out map[string]poseKeypoint) error {
	if len(names) == 0 {
		return fmt.Errorf("keypoints without names: set keypointNames (in the model's order)")
	}
	for i, item := range list {
		if i >= len(names) {
			break
		}
		if kp, ok := keypointOf(item); ok && names[i] != "" {
			out[names[i]] = kp
		}
	}
	return nil
}

// keypointsOf reads the keypoints of one value: a detection {keypoints}, a
// map {name: {x, y, conf} | [x, y, conf]}, a list [{name, x, y, conf}] or a
// list in the model's order (named by names).
func keypointsOf(v any, names []string, out map[string]poseKeypoint) error {
	switch x := v.(type) {
	case map[string]any:
		if inner, ok := x["keypoints"]; ok {
			return keypointsOf(inner, names, out)
		}
		for name, item := range x {
			if kp, ok := keypointOf(item); ok {
				out[name] = kp
			}
		}
		return nil
	case []any:
		if len(x) == 0 {
			return nil
		}
		if first, ok := x[0].(map[string]any); ok {
			if _, named := first["name"]; named {
				for _, item := range x {
					m, _ := item.(map[string]any)
					name, _ := m["name"].(string)
					if kp, ok := keypointOf(m); ok && name != "" {
						out[name] = kp
					}
				}
				return nil
			}
		}
		return indexedKeypoints(x, names, out)
	}
	return fmt.Errorf("no keypoints")
}

// detectionList says whether v is a list of detections (each with keypoints)
// and picks the most confident one, of the class when one is given.
func bestDetection(v any, class string) (map[string]any, bool) {
	list, ok := v.([]any)
	if !ok || len(list) == 0 {
		return nil, false
	}
	first, ok := list[0].(map[string]any)
	if !ok {
		return nil, false
	}
	if _, has := first["keypoints"]; !has {
		return nil, false
	}
	var best map[string]any
	bestConf := math.Inf(-1)
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if class != "" {
			label, _ := firstOf(m, "label", "class", "className", "name")
			if fmt.Sprint(label) != class {
				continue
			}
		}
		conf := 1.0
		if cv, ok := firstOf(m, "confidence", "conf", "score"); ok {
			if n, ok := toNumber(cv); ok {
				conf = n
			}
		}
		if conf > bestConf {
			best, bestConf = m, conf
		}
	}
	return best, true
}

func (c *poseConfig) readKeypoints(topic string, payload map[string]any) (map[string]poseKeypoint, string) {
	raw, ok := lookupPath(topic, payload, c.InputPath)
	if !ok {
		for _, alt := range []string{"payload.keypoints", "payload.detections"} {
			if alt != c.InputPath {
				if raw, ok = lookupPath(topic, payload, alt); ok {
					break
				}
			}
		}
		if !ok {
			return nil, "no keypoints in " + c.InputPath
		}
	}
	if list, isList := raw.([]any); isList && len(list) == 0 {
		return nil, "no detection"
	}
	out := map[string]poseKeypoint{}
	if _, isDetections := bestDetection(raw, ""); isDetections && len(c.NamesByClass) > 0 {
		// one object made of several classes (a turbine and its rotor): the
		// most confident detection of each, its keypoints named by its class
		found := 0
		for class, names := range c.NamesByClass {
			det, _ := bestDetection(raw, class)
			if det == nil {
				continue
			}
			found++
			if err := keypointsOf(det, names, out); err != nil {
				return nil, err.Error()
			}
		}
		if found == 0 {
			return nil, "no detection of the classes " + strings.Join(c.classList(), ", ")
		}
	} else {
		if det, isDetections := bestDetection(raw, c.ClassName); isDetections {
			if det == nil {
				if c.ClassName != "" {
					return nil, "no detection of class " + c.ClassName
				}
				return nil, "no detection"
			}
			raw = det
		}
		if err := keypointsOf(raw, c.KeypointNames, out); err != nil {
			return nil, err.Error()
		}
	}
	for name, kp := range out {
		if kp.Conf < c.MinConfidence || math.IsNaN(kp.U) || math.IsNaN(kp.V) {
			delete(out, name)
		}
	}
	return out, ""
}

func (c *poseConfig) classList() []string {
	out := make([]string, 0, len(c.NamesByClass))
	for class := range c.NamesByClass {
		out = append(out, class)
	}
	sort.Strings(out)
	return out
}

// camera is the calibrated camera for images of the message's size.
func (c *poseConfig) camera(topic string, payload map[string]any) (geometry.Camera, float64, []string, string) {
	var w, h float64
	if v, ok := lookupPath(topic, payload, c.WidthPath); ok {
		w, _ = toNumber(v)
	}
	if v, ok := lookupPath(topic, payload, c.HeightPath); ok {
		h, _ = toNumber(v)
	}
	var warnings []string
	if c.Calibration == nil {
		if w <= 0 || h <= 0 {
			return geometry.Camera{}, 0, nil, "no calibration and no image size (" + c.WidthPath + ", " + c.HeightPath + ")"
		}
		side := h
		switch c.FovSide {
		case "horizontal":
			side = w
		case "long":
			side = math.Max(w, h)
		}
		f := side / 2 / math.Tan(c.FovDeg*math.Pi/360)
		warnings = append(warnings, fmt.Sprintf("not calibrated: a %.0f° field of view (%s side) is assumed", c.FovDeg, c.FovSide))
		return geometry.Camera{Fx: f, Fy: f, Cx: w / 2, Cy: h / 2}, h, warnings, ""
	}
	cam := *c.Calibration
	calW, calH := c.CalibW, c.CalibH
	if (calW <= 0 || calH <= 0) && w > 0 && h > 0 {
		// without the calibration's image size, the principal point is taken
		// as its centre; only a clearly different size is scaled
		gw, gh := 2*cam.Cx, 2*cam.Cy
		if math.Abs(w/gw-1) > 0.1 || math.Abs(h/gh-1) > 0.1 {
			calW, calH = gw, gh
			warnings = append(warnings, "the calibration has no image size (image_width, image_height): it is taken as twice the principal point to scale it")
		}
	}
	if w > 0 && h > 0 && calW > 0 && calH > 0 && (math.Abs(w-calW) > 0.5 || math.Abs(h-calH) > 0.5) {
		sx, sy := w/calW, h/calH
		if math.Abs(sx-sy) > 0.03*math.Max(sx, sy) {
			if math.Abs(w/calH-h/calW) < 0.03*(w/calH) {
				return geometry.Camera{}, 0, nil, fmt.Sprintf("the image (%gx%g) is rotated with respect to the calibration (%gx%g): calibrate in this orientation or rotate the frames", w, h, math.Round(calW), math.Round(calH))
			}
			warnings = append(warnings, fmt.Sprintf("the image (%gx%g) and the calibration (%gx%g) have different aspect ratios", w, h, math.Round(calW), math.Round(calH)))
		}
		cam = cam.Scaled(sx, sy)
	}
	if h <= 0 {
		h = calH
	}
	if h <= 0 {
		h = 2 * cam.Cy
	}
	return cam, h, warnings, ""
}

// ---- state ----

type posePartState struct {
	K       geometry.Kalman1D
	Updates int
	LastMs  int64
}

type poseState struct {
	LastMs    int64
	HasPose   bool
	R         geometry.Mat3
	T         geometry.Vec3
	Filter    geometry.PoseFilter
	Reference *geometry.Pose            `json:",omitempty"`
	Parts     map[string]*posePartState `json:",omitempty"`
	Frames    int
	// a pose far from the track, waiting for confirmation by the next frames
	Pending      *geometry.Pose `json:",omitempty"`
	PendingCount int            `json:",omitempty"`
	PendingMs    int64          `json:",omitempty"`
}

// ---- one frame ----

type poseFrame struct {
	ok       bool
	reason   string
	result   map[string]any
	camera   map[string]any // payload.camera for the viewer
	animated map[string]any // payload.customAnimation
}

func round(x float64, digits int) float64 {
	p := math.Pow(10, float64(digits))
	return math.Round(x*p) / p
}

func vecOut(v geometry.Vec3, digits int) []float64 {
	return []float64{round(v[0], digits), round(v[1], digits), round(v[2], digits)}
}

func quatOut(q [4]float64) []float64 {
	return []float64{round(q[0], 6), round(q[1], 6), round(q[2], 6), round(q[3], 6)}
}

// step processes one frame. The state is a copy the caller stores.
func (c *poseConfig) step(state *poseState, topic string, payload map[string]any, now time.Time) (*poseState, poseFrame) {
	next := &poseState{}
	if state != nil {
		*next = *state
		next.Parts = map[string]*posePartState{}
		for k, v := range state.Parts {
			cp := *v
			next.Parts[k] = &cp
		}
	}
	if next.Parts == nil {
		next.Parts = map[string]*posePartState{}
	}
	t := messageTime(topic, payload, c.TimePath, now)
	ms := t.UnixMilli()

	kps, reason := c.readKeypoints(topic, payload)
	if reason != "" {
		return next, poseFrame{reason: reason}
	}
	cam, imageH, warnings, reason := c.camera(topic, payload)
	if reason != "" {
		return next, poseFrame{reason: reason}
	}
	warnings = append(append([]string{}, c.Warnings...), warnings...)

	var corr []geometry.Correspondence
	names := make([]string, 0, len(kps))
	for name := range kps {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if p, ok := c.PosePoints[name]; ok {
			corr = append(corr, geometry.Correspondence{Name: name, Object: p, U: kps[name].U, V: kps[name].V})
		}
	}
	if len(corr) < c.MinPoints {
		return next, poseFrame{reason: fmt.Sprintf("%d keypoints of the rigid body, %d needed", len(corr), c.MinPoints)}
	}
	gap := time.Duration(ms-next.LastMs) * time.Millisecond
	stale := !next.HasPose || next.LastMs == 0 || gap > c.ResetAfter || gap < 0
	opt := geometry.Options{InlierThreshold: c.InlierPx, MinInliers: c.MinPoints}
	if !stale {
		prev := geometry.Pose{R: next.R, T: next.T}
		opt.Initial = &prev
	}
	res, err := geometry.SolvePnP(cam, corr, opt)
	if err != nil {
		return next, poseFrame{reason: err.Error()}
	}
	pose := res.Pose
	// After a gap the track is lost: the first pose waits for a second frame
	// that agrees with it, so that a lone flipped pose is not shown (the very
	// first pose of the node is taken at once).
	if stale && next.HasPose && c.MaxJumpDeg > 0 && c.ConfirmFrames > 1 {
		agrees := false
		if next.Pending != nil && ms-next.PendingMs >= 0 && time.Duration(ms-next.PendingMs)*time.Millisecond <= c.ResetAfter {
			pt, pm := poseDistance(*next.Pending, pose)
			agrees = pt <= c.MaxJumpDeg && pm <= c.MaxJump*math.Max(next.Pending.T.Norm(), 0.1)
		}
		if !agrees {
			p := pose
			next.Pending, next.PendingCount, next.PendingMs = &p, 1, ms
			return next, poseFrame{reason: "the track was lost: waiting for a second frame that agrees with this pose"}
		}
	}
	// A pose far from the track is left out unless the next frames confirm it.
	// A flipped solution (keypoints nearly on a plane have two), or a detector
	// that bunches the keypoints up in a close-up, gives such poses for a frame
	// or a few; a real change (the camera really moved fast) persists.
	if !stale && c.MaxJumpDeg > 0 {
		prev := geometry.Pose{R: next.R, T: next.T}
		turn, move := poseDistance(prev, pose)
		limit := c.MaxJump * math.Max(prev.T.Norm(), 0.1)
		if turn > c.MaxJumpDeg || move > limit {
			if next.Pending != nil && next.PendingCount > 0 {
				pt, pm := poseDistance(*next.Pending, pose)
				if pt <= c.MaxJumpDeg && pm <= c.MaxJump*math.Max(next.Pending.T.Norm(), 0.1) {
					next.PendingCount++
				} else {
					next.PendingCount = 1
				}
			} else {
				next.PendingCount = 1
			}
			p := pose
			next.Pending, next.PendingMs = &p, ms
			if next.PendingCount < c.ConfirmFrames {
				return next, poseFrame{reason: fmt.Sprintf("left out: %.0f° and %.2f m away from the previous pose (%d of %d frames to accept it)",
					turn, move, next.PendingCount, c.ConfirmFrames)}
			}
			// confirmed: start the filters again from it
			stale = true
		}
	}
	next.Pending, next.PendingCount, next.PendingMs = nil, 0, 0
	dt := 0.0
	if !stale {
		dt = gap.Seconds()
	}
	next.HasPose, next.R, next.T = true, pose.R, pose.T
	next.LastMs = ms
	next.Frames++

	result := map[string]any{
		"ok":                true,
		"mode":              c.Mode,
		"points":            len(corr),
		"inliers":           len(res.Inliers),
		"outliers":          res.Outliers,
		"reprojectionError": round(res.RMSError, 3),
		"distance":          round(pose.T.Norm(), 4),
		"opencv": map[string]any{
			"rvec": vecOut(geometry.RotationVector(pose.R), 6),
			"tvec": vecOut(pose.T, 6),
		},
	}
	frame := poseFrame{ok: true, result: result, animated: map[string]any{}}

	noise := c.Noise
	noise.Position += c.NoiseRelative * pose.T.Norm()
	if c.Mode == "camera" {
		// the camera in the object's (viewer's) frame: centre and orientation
		position, orientation := pose.CameraCenter(), pose.R.T()
		if c.Smoothing {
			if stale {
				next.Filter.Reset(position, orientation, noise)
			} else {
				position, orientation = next.Filter.Step(dt, position, orientation, noise)
			}
		}
		threePos, threeQ := geometry.ThreeCamera(geometry.Pose{R: orientation.T(), T: orientation.T().MulVec(position).Scale(-1)})
		fov := cam.VerticalFovDeg(imageH)
		cameraOut := map[string]any{
			"position":   vecOut(threePos, 5),
			"quaternion": quatOut(threeQ),
			"fov":        round(fov, 3),
		}
		result["camera"] = cameraOut
		if c.Viewer {
			frame.camera = map[string]any{
				"position":   cameraOut["position"],
				"quaternion": cameraOut["quaternion"],
				"fov":        cameraOut["fov"],
				"projection": "perspective",
				"follow":     c.Follow,
			}
		}
	} else {
		if stale && next.Reference == nil {
			ref := pose
			next.Reference = &ref
		}
		r0 := next.Reference
		// the object's motion since the reference, seen by a fixed camera
		relR := r0.R.T().Mul(pose.R)
		relT := r0.R.T().MulVec(pose.T.Sub(r0.T))
		if c.Smoothing {
			if stale {
				next.Filter.Reset(relT, relR, noise)
			} else {
				relT, relR = next.Filter.Step(dt, relT, relR, noise)
			}
		}
		euler := geometry.EulerXYZ(relR).Scale(180 / math.Pi)
		q := geometry.QuaternionFromMatrix(relR)
		obj := map[string]any{
			"position":   vecOut(relT, 5),
			"quaternion": quatOut(q),
			"rotation":   map[string]any{"x": round(euler[0], 3), "y": round(euler[1], 3), "z": round(euler[2], 3)},
		}
		if c.Smoothing {
			v, w := next.Filter.Velocity()
			obj["velocity"] = vecOut(v, 4)
			obj["angularVelocity"] = vecOut(w, 4)
		}
		result["object"] = obj
		if c.Viewer && c.ObjectNode != "" {
			frame.animated[c.ObjectNode] = map[string]any{
				"position":   vecOut(relR.MulVec(c.ObjectNodePos).Add(relT), 5),
				"quaternion": quatOut(q),
			}
		}
	}

	if len(c.Parts) > 0 {
		parts := map[string]any{}
		for _, part := range c.Parts {
			out, warn := c.stepPart(part, next, cam, pose, kps, ms)
			parts[part.Name] = out
			if warn != "" {
				warnings = append(warnings, warn)
			}
			if c.Viewer && part.NodeName != "" && out["ready"] == true {
				if part.Type == "rotation" {
					frame.animated[part.NodeName] = map[string]any{"quaternion": out["quaternion"]}
				} else {
					frame.animated[part.NodeName] = map[string]any{"position": out["nodePosition"]}
				}
			}
		}
		result["parts"] = parts
	}
	if len(warnings) > 0 {
		result["warnings"] = warnings
	}
	return next, frame
}

// stepPart measures a moving part with the frame's pose and filters it.
func (c *poseConfig) stepPart(part *posePart, state *poseState, cam geometry.Camera, pose geometry.Pose, kps map[string]poseKeypoint, ms int64) (map[string]any, string) {
	period := 2 * math.Pi / float64(part.Symmetry)
	if part.Type == "translation" {
		period = 0
	}
	// the measurement: a weighted circular mean (n-fold) or a weighted mean
	var sumS, sumC, sum, weight float64
	observed := 0
	for _, name := range part.Keypoints {
		kp, ok := kps[name]
		if !ok {
			continue
		}
		o, d := cam.RayInObject(pose, kp.U, kp.V)
		if part.Type == "rotation" {
			hit, ok := geometry.IntersectPlane(o, d, part.Origin, part.Axis)
			if !ok {
				continue
			}
			theta := geometry.AngleAround(hit, part.Origin, part.E1, part.E2) - part.RestAngle[name]
			n := float64(part.Symmetry)
			sumS += kp.Conf * math.Sin(n*theta)
			sumC += kp.Conf * math.Cos(n*theta)
		} else {
			rest := part.Rest[name]
			on, ok := geometry.ClosestOnLine(o, d, rest, part.Axis)
			if !ok {
				continue
			}
			sum += kp.Conf * on.Sub(rest).Dot(part.Axis)
		}
		weight += kp.Conf
		observed++
	}
	ps := state.Parts[part.Name]
	out := map[string]any{"type": part.Type, "observed": observed}
	warn := ""
	if observed > 0 {
		var z float64
		if part.Type == "rotation" {
			z = math.Atan2(sumS, sumC) / float64(part.Symmetry)
		} else {
			z = sum / weight
		}
		r := part.Noise * part.Noise / float64(observed)
		q := part.MaxAccel * part.MaxAccel
		gap := 0.0
		if ps != nil {
			gap = float64(ms-ps.LastMs) / 1000
		}
		if ps == nil || gap <= 0 || gap > c.ResetAfter.Seconds() {
			v0 := 10.0
			if part.Expected != 0 {
				v0 = math.Pow(0.25*math.Abs(part.Expected)+0.5, 2)
			}
			ps = &posePartState{K: geometry.NewKalman1D(z, part.Expected, r, v0)}
		} else {
			prevX := ps.K.X
			ps.K.Predict(gap, q)
			if period > 0 {
				var meas float64
				if ps.Updates < 2 && part.Expected == 0 && part.Direction != 0 {
					// the direction is known but not the speed: the smallest step that way
					step := math.Mod(z-prevX, period)
					if step < 0 {
						step += period
					}
					if part.Direction < 0 && step > 0 {
						step -= period
					}
					meas = prevX + step
				} else {
					meas = ps.K.X + geometry.WrapPeriod(z-ps.K.X, period)
				}
				ps.K.Update(meas, r)
				// beyond this, the next frames may jump to a wrong blade
				limit := period / 2
				if part.Direction != 0 || part.Expected != 0 {
					limit = period
				}
				step := math.Abs(ps.K.V) * gap
				out["stepPerFrame"] = round(step*180/math.Pi, 2)
				if step > 0.8*limit {
					warn = fmt.Sprintf("%s turns between frames close to the %.0f° that its %d-fold symmetry allows (the blades may be confused): raise the frame rate, or set direction and expectedSpeed",
						part.Name, limit*180/math.Pi, part.Symmetry)
				}
			} else {
				ps.K.Update(z, r)
			}
		}
		ps.Updates++
		ps.LastMs = ms
		state.Parts[part.Name] = ps
	}
	if ps == nil {
		out["ready"] = false
		return out, warn
	}
	out["ready"] = true
	if part.Type == "rotation" {
		angle := ps.K.X
		deg := math.Mod(angle*180/math.Pi, 360)
		if deg < 0 {
			deg += 360
		}
		out["angle"] = round(deg, 3)
		out["angleUnwrapped"] = round(angle*180/math.Pi, 3)
		out["angularVelocity"] = round(ps.K.V, 4)
		out["rpm"] = round(ps.K.V*60/(2*math.Pi), 3)
		out["quaternion"] = quatOut(geometry.QuaternionFromAxisAngle(part.Axis, angle))
	} else {
		out["displacement"] = round(ps.K.X, 5)
		out["velocity"] = round(ps.K.V, 5)
		out["nodePosition"] = vecOut(part.NodePos.Add(part.Axis.Scale(ps.K.X)), 5)
	}
	return out, warn
}

// poseDistance: how much the camera turned (degrees) and moved (its centre, in
// the object's units) between two poses
func poseDistance(a, b geometry.Pose) (float64, float64) {
	turn := geometry.RotationVector(a.R.T().Mul(b.R)).Norm() * 180 / math.Pi
	return turn, a.CameraCenter().Sub(b.CameraCenter()).Norm()
}
