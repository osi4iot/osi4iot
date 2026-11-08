package geometry

import (
	"math"
	"math/rand"
	"testing"
)

func TestThreeCameraLooksAtTheObject(t *testing.T) {
	// a camera at (0, -3, 0) (Z up world) looking at the origin
	pose := lookAt(Vec3{0, -3, 0}, Vec3{0, 0, 0})
	pos, q := ThreeCamera(pose)
	if pos.Sub(Vec3{0, -3, 0}).Norm() > 1e-9 {
		t.Fatalf("position %v", pos)
	}
	m := MatrixFromQuaternion(q)
	// a three.js camera looks along its -Z, its up is +Y
	forward := m.MulVec(Vec3{0, 0, -1})
	up := m.MulVec(Vec3{0, 1, 0})
	if forward.Sub(Vec3{0, 1, 0}).Norm() > 1e-9 || up.Sub(Vec3{0, 0, 1}).Norm() > 1e-9 {
		t.Fatalf("forward %v up %v", forward, up)
	}
}

func TestBlenderToGLTF(t *testing.T) {
	if BlenderToGLTF(Vec3{1, 2, 3}) != (Vec3{1, 3, -2}) {
		t.Fatal(BlenderToGLTF(Vec3{1, 2, 3}))
	}
}

func TestEulerXYZ(t *testing.T) {
	rx, ry, rz := 0.3, -0.5, 1.1
	R := Rodrigues(Vec3{rx, 0, 0}).Mul(Rodrigues(Vec3{0, ry, 0})).Mul(Rodrigues(Vec3{0, 0, rz}))
	e := EulerXYZ(R)
	if e.Sub(Vec3{rx, ry, rz}).Norm() > 1e-9 {
		t.Fatal(e)
	}
}

func TestQuaternionRoundTrip(t *testing.T) {
	R := Rodrigues(Vec3{0.4, -1.2, 2.0})
	back := MatrixFromQuaternion(QuaternionFromMatrix(R))
	if angleBetween(R, back) > 1e-7 {
		t.Fatal(back)
	}
}

func TestWrap(t *testing.T) {
	if math.Abs(WrapPi(3*math.Pi)+math.Pi) > 1e-12 || math.Abs(WrapPeriod(2.2, 2*math.Pi/3)-(2.2-2*math.Pi/3)) > 1e-12 {
		t.Fatal(WrapPi(3*math.Pi), WrapPeriod(2.2, 2*math.Pi/3))
	}
}

func TestPoseFilterSmoothsAndFollows(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	noise := PoseNoise{Position: 0.02, Angle: 0.02, Acceleration: 0.05, AngularAcceleration: 0.05}
	var f PoseFilter
	var rawErr, filtErr float64
	dt := 0.1
	for i := 0; i < 200; i++ {
		tm := float64(i) * dt
		truthP := Vec3{0.2 * tm, 1, 0}
		truthR := Rodrigues(Vec3{0, 0, 0.1 * tm})
		measP := truthP.Add(Vec3{rng.NormFloat64(), rng.NormFloat64(), rng.NormFloat64()}.Scale(0.02))
		measR := Rodrigues(Vec3{rng.NormFloat64(), rng.NormFloat64(), rng.NormFloat64()}.Scale(0.02)).Mul(truthR)
		p, r := f.Step(dt, measP, measR, noise)
		if i > 50 {
			rawErr += measP.Sub(truthP).Norm() + angleBetween(measR, truthR)*math.Pi/180
			filtErr += p.Sub(truthP).Norm() + angleBetween(r, truthR)*math.Pi/180
		}
	}
	if filtErr > 0.6*rawErr {
		t.Fatalf("filtered error %.3f, raw %.3f", filtErr, rawErr)
	}
	v, w := f.Velocity()
	if math.Abs(v[0]-0.2) > 0.05 || math.Abs(w[2]-0.1) > 0.04 {
		t.Fatalf("velocity %v angular %v", v, w)
	}
}
