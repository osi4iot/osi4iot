package geometry

import "math"

// ---- frames ----

// BlenderToGLTF turns a point of Blender (Z up) into glTF / three.js (Y up),
// as Blender's glTF exporter does: (x, y, z) -> (x, z, -y).
func BlenderToGLTF(p Vec3) Vec3 { return Vec3{p[0], p[2], -p[1]} }

// cvToThree turns the axes of an OpenCV camera (X right, Y down, Z forward)
// into a three.js camera's (X right, Y up, looking along -Z).
var cvToThree = Mat3{{1, 0, 0}, {0, -1, 0}, {0, 0, -1}}

// ThreeCamera is the pose of a three.js camera that sees the object as the
// real camera does, in the object's frame (the viewer's when the 3D points are
// in the glb's coordinates): its position and its orientation quaternion
// (x, y, z, w).
func ThreeCamera(p Pose) (Vec3, [4]float64) {
	orientation := p.R.T().Mul(cvToThree)
	return p.CameraCenter(), QuaternionFromMatrix(orientation)
}

// ---- quaternions (x, y, z, w) and rotations ----

func QuaternionFromAxisAngle(axis Vec3, angle float64) [4]float64 {
	a := axis.Unit()
	s := math.Sin(angle / 2)
	return [4]float64{a[0] * s, a[1] * s, a[2] * s, math.Cos(angle / 2)}
}

// MatrixFromQuaternion is the rotation of a unit quaternion (x, y, z, w).
func MatrixFromQuaternion(q [4]float64) Mat3 {
	x, y, z, w := q[0], q[1], q[2], q[3]
	return Mat3{
		{1 - 2*(y*y+z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)},
		{2 * (x*y + z*w), 1 - 2*(x*x+z*z), 2 * (y*z - x*w)},
		{2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2*(x*x+y*y)},
	}
}

// EulerXYZ are the angles (radians) of three.js's Euler order "XYZ" of a
// rotation: R = Rx(x) * Ry(y) * Rz(z).
func EulerXYZ(m Mat3) Vec3 {
	sy := math.Max(-1, math.Min(1, m[0][2]))
	y := math.Asin(sy)
	if math.Abs(sy) < 0.9999999 {
		return Vec3{math.Atan2(-m[1][2], m[2][2]), y, math.Atan2(-m[0][1], m[0][0])}
	}
	return Vec3{math.Atan2(m[2][1], m[1][1]), y, 0}
}

// ---- angles ----

// WrapPi brings an angle to [-pi, pi).
func WrapPi(a float64) float64 {
	a = math.Mod(a+math.Pi, 2*math.Pi)
	if a < 0 {
		a += 2 * math.Pi
	}
	return a - math.Pi
}

// WrapPeriod brings an angle to [-period/2, period/2).
func WrapPeriod(a, period float64) float64 {
	a = math.Mod(a+period/2, period)
	if a < 0 {
		a += period
	}
	return a - period/2
}

// PlaneBasis is two unit vectors perpendicular to axis and to each other, so
// that (e1, e2, axis) is right-handed: angles measured from e1 towards e2 turn
// counter-clockwise seen from the tip of axis.
func PlaneBasis(axis Vec3) (Vec3, Vec3) {
	a := axis.Unit()
	ref := Vec3{1, 0, 0}
	if math.Abs(a[0]) > 0.9 {
		ref = Vec3{0, 1, 0}
	}
	e1 := ref.Sub(a.Scale(ref.Dot(a))).Unit()
	return e1, a.Cross(e1)
}

// AngleAround is the angle of point p around the axis through origin, in the
// plane basis (e1, e2).
func AngleAround(p, origin, e1, e2 Vec3) float64 {
	d := p.Sub(origin)
	return math.Atan2(d.Dot(e2), d.Dot(e1))
}

// ---- Kalman filter of a constant-velocity signal ----

// Kalman1D tracks a value and its rate; the acceleration is white noise of
// density Q (units/s^2)^2 * s.
type Kalman1D struct {
	X, V          float64
	PXX, PXV, PVV float64
}

func NewKalman1D(x, v, varX, varV float64) Kalman1D {
	return Kalman1D{X: x, V: v, PXX: varX, PVV: varV}
}

func (k *Kalman1D) Predict(dt, q float64) {
	if dt <= 0 {
		return
	}
	k.X += k.V * dt
	pxx := k.PXX + dt*(2*k.PXV+dt*k.PVV) + q*dt*dt*dt/3
	pxv := k.PXV + dt*k.PVV + q*dt*dt/2
	pvv := k.PVV + q*dt
	k.PXX, k.PXV, k.PVV = pxx, pxv, pvv
}

// Update with a measurement z of the value, of variance r; returns the
// innovation (z minus the prediction).
func (k *Kalman1D) Update(z, r float64) float64 {
	y := z - k.X
	s := k.PXX + r
	if s <= 0 {
		return y
	}
	kx, kv := k.PXX/s, k.PXV/s
	k.X += kx * y
	k.V += kv * y
	pxx := (1 - kx) * k.PXX
	pxv := (1 - kx) * k.PXV
	pvv := k.PVV - kv*k.PXV
	k.PXX, k.PXV, k.PVV = pxx, pxv, pvv
	return y
}

// PoseFilter smooths a pose (a position and an orientation) with a
// constant-velocity Kalman filter per axis; the orientation is filtered as
// small rotations around the predicted one.
type PoseFilter struct {
	Position [3]Kalman1D
	// orientation (x, y, z, w) and the filters of the small rotation around
	// each world axis (their X is the correction, V the angular velocity)
	Orientation [4]float64
	Rotation    [3]Kalman1D
	Ready       bool
}

type PoseNoise struct {
	// standard deviation of a measurement: metres and radians
	Position, Angle float64
	// how fast the motion may change: m/s^2 and rad/s^2
	Acceleration, AngularAcceleration float64
}

func (f *PoseFilter) Reset(position Vec3, orientation Mat3, n PoseNoise) {
	for i := 0; i < 3; i++ {
		f.Position[i] = NewKalman1D(position[i], 0, n.Position*n.Position, 1)
		f.Rotation[i] = NewKalman1D(0, 0, n.Angle*n.Angle, 1)
	}
	f.Orientation = QuaternionFromMatrix(orientation)
	f.Ready = true
}

// Step predicts dt seconds ahead and corrects with the measured pose; it
// returns the filtered pose.
func (f *PoseFilter) Step(dt float64, position Vec3, orientation Mat3, n PoseNoise) (Vec3, Mat3) {
	if !f.Ready {
		f.Reset(position, orientation, n)
		return position, orientation
	}
	qa := n.Acceleration * n.Acceleration
	qr := n.AngularAcceleration * n.AngularAcceleration
	var out Vec3
	for i := 0; i < 3; i++ {
		f.Position[i].Predict(dt, qa)
		f.Position[i].Update(position[i], n.Position*n.Position)
		out[i] = f.Position[i].X
	}
	// predicted orientation: turn by the angular velocity
	omega := Vec3{f.Rotation[0].V, f.Rotation[1].V, f.Rotation[2].V}
	predicted := Rodrigues(omega.Scale(math.Max(dt, 0))).Mul(MatrixFromQuaternion(f.Orientation))
	delta := RotationVector(orientation.Mul(predicted.T()))
	var correction Vec3
	for i := 0; i < 3; i++ {
		// the turn V*dt is already in the predicted orientation
		f.Rotation[i].Predict(dt, qr)
		f.Rotation[i].X = 0
		f.Rotation[i].Update(delta[i], n.Angle*n.Angle)
		correction[i] = f.Rotation[i].X
	}
	filtered := Rodrigues(correction).Mul(predicted)
	f.Orientation = QuaternionFromMatrix(filtered)
	return out, filtered
}

// Velocity is the filtered linear velocity (m/s) and angular velocity (rad/s, world axes).
func (f *PoseFilter) Velocity() (Vec3, Vec3) {
	return Vec3{f.Position[0].V, f.Position[1].V, f.Position[2].V}, Vec3{f.Rotation[0].V, f.Rotation[1].V, f.Rotation[2].V}
}
