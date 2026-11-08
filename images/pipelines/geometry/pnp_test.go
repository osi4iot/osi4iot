package geometry

import (
	"math"
	"math/rand"
	"sort"
	"testing"
)

// The 3D points of the OC4 floating wind turbine model (Blender, metres, Z up)
var oc4Points = map[string]Vec3{
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

// a phone in landscape, 1280x720
var phone = Camera{Fx: 1000, Fy: 1000, Cx: 640, Cy: 360, Dist: [5]float64{0.08, -0.15, 0.001, -0.0005, 0.05}}

// lookAt: the pose of a camera at eye looking at target, with world up (Z)
func lookAt(eye, target Vec3) Pose {
	z := target.Sub(eye).Unit()        // camera forward
	x := z.Cross(Vec3{0, 0, 1}).Unit() // camera right
	y := z.Cross(x)                    // camera down
	R := Mat3{x, y, z}                 // rows: world -> camera
	return Pose{R: R, T: R.MulVec(eye).Scale(-1)}
}

func project(cam Camera, pose Pose, pts map[string]Vec3, noise float64, rng *rand.Rand) []Correspondence {
	names := make([]string, 0, len(pts))
	for name := range pts {
		names = append(names, name)
	}
	sort.Strings(names)
	var out []Correspondence
	for _, name := range names {
		p := pts[name]
		u, v, ok := cam.Project(pose.Apply(p))
		if !ok {
			continue
		}
		out = append(out, Correspondence{Name: name, Object: p, U: u + rng.NormFloat64()*noise, V: v + rng.NormFloat64()*noise})
	}
	return out
}

func angleBetween(a, b Mat3) float64 {
	return RotationVector(a.T().Mul(b)).Norm() * 180 / math.Pi
}

func TestRodriguesRoundTrip(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	for i := 0; i < 200; i++ {
		axis := Vec3{rng.NormFloat64(), rng.NormFloat64(), rng.NormFloat64()}.Unit()
		r := axis.Scale(rng.Float64() * math.Pi * 0.999)
		back := RotationVector(Rodrigues(r))
		if back.Sub(r).Norm() > 1e-9 {
			t.Fatalf("rodrigues %v -> %v", r, back)
		}
	}
}

func TestNormalizeInvertsDistortion(t *testing.T) {
	for _, p := range [][2]float64{{0, 0}, {0.3, -0.2}, {-0.5, 0.35}} {
		u, v, _ := phone.Project(Vec3{p[0], p[1], 1})
		x, y := phone.Normalize(u, v)
		if math.Hypot(x-p[0], y-p[1]) > 1e-9 {
			t.Fatalf("normalize %v -> %v %v", p, x, y)
		}
	}
}

func TestSolvePnPOC4(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	target := Vec3{0, 0.2, 0.7}
	for i := 0; i < 50; i++ {
		az := rng.Float64() * 2 * math.Pi
		el := 0.1 + rng.Float64()*0.6
		d := 1.8 + rng.Float64()*1.5
		eye := target.Add(Vec3{d * math.Cos(el) * math.Cos(az), d * math.Cos(el) * math.Sin(az), d * math.Sin(el)})
		truth := lookAt(eye, target)
		pts := project(phone, truth, oc4Points, 0.7, rng)
		res, err := SolvePnP(phone, pts, Options{})
		if err != nil {
			t.Fatalf("view %d: %v", i, err)
		}
		if a := angleBetween(res.Pose.R, truth.R); a > 1.5 {
			t.Errorf("view %d: rotation off by %.2f deg", i, a)
		}
		if e := res.Pose.CameraCenter().Sub(eye).Norm(); e > 0.03*d {
			t.Errorf("view %d: camera centre off by %.3f m at %.2f m", i, e, d)
		}
		if res.RMSError > 2 || len(res.Outliers) != 0 {
			t.Errorf("view %d: rms %.2f outliers %v", i, res.RMSError, res.Outliers)
		}
	}
}

func TestSolvePnPLeavesOutWrongKeypoints(t *testing.T) {
	rng := rand.New(rand.NewSource(11))
	eye := Vec3{1.6, -1.4, 1.2}
	truth := lookAt(eye, Vec3{0, 0.2, 0.7})
	pts := project(phone, truth, oc4Points, 0.5, rng)
	// two keypoints detected far from where they are
	wrong := map[string]bool{}
	for i := 0; i < 2; i++ {
		pts[i].U += 90
		pts[i].V -= 60
		wrong[pts[i].Name] = true
	}
	res, err := SolvePnP(phone, pts, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Outliers) != 2 || !wrong[res.Outliers[0]] || !wrong[res.Outliers[1]] {
		t.Fatalf("outliers %v, want %v", res.Outliers, wrong)
	}
	if a := angleBetween(res.Pose.R, truth.R); a > 1.5 {
		t.Fatalf("rotation off by %.2f deg", a)
	}
}

func TestSolvePnPFromPreviousPose(t *testing.T) {
	rng := rand.New(rand.NewSource(5))
	target := Vec3{0, 0.2, 0.7}
	prev := lookAt(Vec3{2, 0.5, 1.0}, target)
	truth := lookAt(Vec3{2.03, 0.55, 1.01}, target)
	pts := project(phone, truth, oc4Points, 0.5, rng)
	res, err := SolvePnP(phone, pts, Options{Initial: &prev})
	if err != nil {
		t.Fatal(err)
	}
	if a := angleBetween(res.Pose.R, truth.R); a > 1 {
		t.Fatalf("rotation off by %.2f deg", a)
	}
}

func TestSolvePnPPlanar(t *testing.T) {
	// an ArUco-like square marker, 10 cm, and its corners and centre, tilted plane
	pts := map[string]Vec3{}
	tilt := Rodrigues(Vec3{0.3, -0.2, 0.1})
	for i, p := range []Vec3{{-0.05, -0.05, 0}, {0.05, -0.05, 0}, {0.05, 0.05, 0}, {-0.05, 0.05, 0}, {0, 0, 0}, {0.02, -0.03, 0}} {
		pts[string(rune('a'+i))] = tilt.MulVec(p).Add(Vec3{0.2, 0.1, 0.3})
	}
	rng := rand.New(rand.NewSource(9))
	for i := 0; i < 20; i++ {
		eye := Vec3{0.2 + rng.Float64()*0.3 - 0.15, 0.1 + rng.Float64()*0.3 - 0.15, 0.3 + 0.5 + rng.Float64()*0.3}
		eye = tilt.MulVec(eye.Sub(Vec3{0.2, 0.1, 0.3})).Add(Vec3{0.2, 0.1, 0.3})
		truth := lookAt(eye, Vec3{0.2, 0.1, 0.3})
		c := project(phone, truth, pts, 0.3, rng)
		res, err := SolvePnP(phone, c, Options{})
		if err != nil {
			t.Fatalf("view %d: %v", i, err)
		}
		// a 10 cm marker: the best fit itself is a few degrees off with 0.3 px of noise
		if a := angleBetween(res.Pose.R, truth.R); a > 4 {
			t.Errorf("view %d: rotation off by %.2f deg", i, a)
		}
	}
}

func TestTooFewPoints(t *testing.T) {
	if _, err := SolvePnP(phone, []Correspondence{{}, {}, {}}, Options{}); err != ErrTooFewPoints {
		t.Fatal(err)
	}
}

func TestRayHelpers(t *testing.T) {
	pose := lookAt(Vec3{0, -3, 0}, Vec3{0, 0, 0})
	p := Vec3{0.3, 0, 0.2}
	u, v, _ := phone.Project(pose.Apply(p))
	o, d := phone.RayInObject(pose, u, v)
	hit, ok := IntersectPlane(o, d, Vec3{0, 0, 0}, Vec3{0, 1, 0})
	if !ok || hit.Sub(p).Norm() > 1e-6 {
		t.Fatalf("plane hit %v", hit)
	}
	on, ok := ClosestOnLine(o, d, Vec3{0, 0, 0.2}, Vec3{1, 0, 0})
	if !ok || on.Sub(p).Norm() > 1e-6 {
		t.Fatalf("line %v", on)
	}
}

func BenchmarkSolvePnPWithOutliers(b *testing.B) {
	rng := rand.New(rand.NewSource(11))
	truth := lookAt(Vec3{1.6, -1.4, 1.2}, Vec3{0, 0.2, 0.7})
	pts := project(phone, truth, oc4Points, 0.5, rng)
	pts[0].U += 90
	for b.Loop() {
		SolvePnP(phone, pts, Options{})
	}
}

func BenchmarkSolvePnPTracking(b *testing.B) {
	rng := rand.New(rand.NewSource(11))
	truth := lookAt(Vec3{1.6, -1.4, 1.2}, Vec3{0, 0.2, 0.7})
	pts := project(phone, truth, oc4Points, 0.5, rng)
	for b.Loop() {
		SolvePnP(phone, pts, Options{Initial: &truth})
	}
}
