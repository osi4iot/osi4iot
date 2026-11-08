// Package geometry estimates the pose of a calibrated camera with respect to a
// rigid object from 2D-3D point correspondences (Perspective-n-Point), with
// the camera model of OpenCV (pinhole with radial and tangential distortion).
//
// Conventions (OpenCV): X_cam = R * X_obj + t; the camera looks along +Z with
// +X right and +Y down; pixels (u, v) from the top-left corner.
//
// SolvePnP gets a first pose by DLT (6 or more points not on a plane) or by a
// homography (4 or more points on a plane), inside RANSAC so that wrong
// detections are left out, and refines it on the inliers with
// Levenberg-Marquardt on the reprojection error in pixels. With an initial
// pose (the previous frame of a video) it refines from it when that pose
// explains the points, which is faster and steadier.
package geometry

import (
	"errors"
	"math"
	"math/rand"
	"sort"

	"gonum.org/v1/gonum/mat"
)

type Vec3 [3]float64
type Mat3 [3][3]float64

func (a Vec3) Add(b Vec3) Vec3      { return Vec3{a[0] + b[0], a[1] + b[1], a[2] + b[2]} }
func (a Vec3) Sub(b Vec3) Vec3      { return Vec3{a[0] - b[0], a[1] - b[1], a[2] - b[2]} }
func (a Vec3) Scale(s float64) Vec3 { return Vec3{a[0] * s, a[1] * s, a[2] * s} }
func (a Vec3) Dot(b Vec3) float64   { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
func (a Vec3) Norm() float64        { return math.Sqrt(a.Dot(a)) }
func (a Vec3) Cross(b Vec3) Vec3 {
	return Vec3{a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]}
}
func (a Vec3) Unit() Vec3 {
	n := a.Norm()
	if n < 1e-15 {
		return a
	}
	return a.Scale(1 / n)
}

func (m Mat3) MulVec(v Vec3) Vec3 {
	return Vec3{
		m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
		m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
		m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
	}
}

func (m Mat3) Mul(n Mat3) Mat3 {
	var r Mat3
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			for k := 0; k < 3; k++ {
				r[i][j] += m[i][k] * n[k][j]
			}
		}
	}
	return r
}

func (m Mat3) T() Mat3 {
	var r Mat3
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			r[i][j] = m[j][i]
		}
	}
	return r
}

func Identity() Mat3 { return Mat3{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}} }

// ---- rotations ----

// Rodrigues turns a rotation vector (axis * angle) into a rotation matrix.
func Rodrigues(r Vec3) Mat3 {
	theta := r.Norm()
	if theta < 1e-12 {
		return Identity()
	}
	k := r.Scale(1 / theta)
	c, s := math.Cos(theta), math.Sin(theta)
	v := 1 - c
	return Mat3{
		{c + k[0]*k[0]*v, k[0]*k[1]*v - k[2]*s, k[0]*k[2]*v + k[1]*s},
		{k[1]*k[0]*v + k[2]*s, c + k[1]*k[1]*v, k[1]*k[2]*v - k[0]*s},
		{k[2]*k[0]*v - k[1]*s, k[2]*k[1]*v + k[0]*s, c + k[2]*k[2]*v},
	}
}

// RotationVector is the inverse of Rodrigues (angle in [0, pi]).
func RotationVector(m Mat3) Vec3 {
	q := QuaternionFromMatrix(m)
	// q = (x, y, z, w); angle = 2 acos(w)
	w := math.Max(-1, math.Min(1, q[3]))
	if w < 0 {
		q = [4]float64{-q[0], -q[1], -q[2], -q[3]}
		w = -w
	}
	angle := 2 * math.Acos(w)
	s := math.Sqrt(math.Max(0, 1-w*w))
	if s < 1e-12 {
		// small angle: axis * angle ~ 2 * vector part
		return Vec3{2 * q[0], 2 * q[1], 2 * q[2]}
	}
	return Vec3{q[0] / s * angle, q[1] / s * angle, q[2] / s * angle}
}

// QuaternionFromMatrix returns (x, y, z, w), normalized, w >= 0.
func QuaternionFromMatrix(m Mat3) [4]float64 {
	tr := m[0][0] + m[1][1] + m[2][2]
	var x, y, z, w float64
	switch {
	case tr > 0:
		s := 0.5 / math.Sqrt(tr+1)
		w = 0.25 / s
		x = (m[2][1] - m[1][2]) * s
		y = (m[0][2] - m[2][0]) * s
		z = (m[1][0] - m[0][1]) * s
	case m[0][0] > m[1][1] && m[0][0] > m[2][2]:
		s := 2 * math.Sqrt(1+m[0][0]-m[1][1]-m[2][2])
		w = (m[2][1] - m[1][2]) / s
		x = 0.25 * s
		y = (m[0][1] + m[1][0]) / s
		z = (m[0][2] + m[2][0]) / s
	case m[1][1] > m[2][2]:
		s := 2 * math.Sqrt(1+m[1][1]-m[0][0]-m[2][2])
		w = (m[0][2] - m[2][0]) / s
		x = (m[0][1] + m[1][0]) / s
		y = 0.25 * s
		z = (m[1][2] + m[2][1]) / s
	default:
		s := 2 * math.Sqrt(1+m[2][2]-m[0][0]-m[1][1])
		w = (m[1][0] - m[0][1]) / s
		x = (m[0][2] + m[2][0]) / s
		y = (m[1][2] + m[2][1]) / s
		z = 0.25 * s
	}
	n := math.Sqrt(x*x + y*y + z*z + w*w)
	if w < 0 {
		n = -n
	}
	return [4]float64{x / n, y / n, z / n, w / n}
}

// nearestRotation is the rotation closest to m (SVD, det +1).
func nearestRotation(m Mat3) Mat3 {
	a := mat.NewDense(3, 3, []float64{m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]})
	var svd mat.SVD
	if !svd.Factorize(a, mat.SVDFull) {
		return Identity()
	}
	var u, v mat.Dense
	svd.UTo(&u)
	svd.VTo(&v)
	var r mat.Dense
	r.Mul(&u, v.T())
	if mat.Det(&r) < 0 {
		// flip the last column of U
		for i := 0; i < 3; i++ {
			u.Set(i, 2, -u.At(i, 2))
		}
		r.Mul(&u, v.T())
	}
	var out Mat3
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			out[i][j] = r.At(i, j)
		}
	}
	return out
}

// ---- camera ----

// Camera is a calibrated camera: intrinsics in pixels and OpenCV distortion
// (k1, k2, p1, p2, k3; missing ones are 0).
type Camera struct {
	Fx, Fy, Cx, Cy float64
	Dist           [5]float64
}

func (c Camera) hasDistortion() bool {
	for _, d := range c.Dist {
		if d != 0 {
			return true
		}
	}
	return false
}

// distort maps normalized coordinates (x/z, y/z) to distorted ones.
func (c Camera) distort(x, y float64) (float64, float64) {
	k1, k2, p1, p2, k3 := c.Dist[0], c.Dist[1], c.Dist[2], c.Dist[3], c.Dist[4]
	r2 := x*x + y*y
	radial := 1 + k1*r2 + k2*r2*r2 + k3*r2*r2*r2
	xd := x*radial + 2*p1*x*y + p2*(r2+2*x*x)
	yd := y*radial + p1*(r2+2*y*y) + 2*p2*x*y
	return xd, yd
}

// Project gives the pixel of a point in camera coordinates; ok is false behind the camera.
func (c Camera) Project(p Vec3) (u, v float64, ok bool) {
	if p[2] <= 1e-9 {
		return 0, 0, false
	}
	x, y := p[0]/p[2], p[1]/p[2]
	x, y = c.distort(x, y)
	return c.Fx*x + c.Cx, c.Fy*y + c.Cy, true
}

// Normalize gives the undistorted normalized coordinates of a pixel (the
// direction of its ray is (x, y, 1)), inverting the distortion iteratively.
func (c Camera) Normalize(u, v float64) (float64, float64) {
	xd, yd := (u-c.Cx)/c.Fx, (v-c.Cy)/c.Fy
	if !c.hasDistortion() {
		return xd, yd
	}
	x, y := xd, yd
	for i := 0; i < 20; i++ {
		dx, dy := c.distort(x, y)
		x -= dx - xd
		y -= dy - yd
	}
	return x, y
}

// Scaled is the camera for images of another size than the calibration's
// (the same field of view, scaled without crop).
func (c Camera) Scaled(sx, sy float64) Camera {
	return Camera{Fx: c.Fx * sx, Fy: c.Fy * sy, Cx: c.Cx * sx, Cy: c.Cy * sy, Dist: c.Dist}
}

// VerticalFovDeg is the vertical field of view of images height pixels high.
func (c Camera) VerticalFovDeg(height float64) float64 {
	return 2 * math.Atan(height/(2*c.Fy)) * 180 / math.Pi
}

// ---- pose ----

// Pose is X_cam = R * X_obj + T.
type Pose struct {
	R Mat3
	T Vec3
}

func (p Pose) Apply(x Vec3) Vec3 { return p.R.MulVec(x).Add(p.T) }

// CameraCenter is the camera's position in the object's frame: -R^T t.
func (p Pose) CameraCenter() Vec3 { return p.R.T().MulVec(p.T).Scale(-1) }

// Correspondence is a 3D point of the object and its pixel.
type Correspondence struct {
	Name   string
	Object Vec3
	U, V   float64
}

// Result of SolvePnP.
type Result struct {
	Pose Pose
	// names of the points that agree with the pose, and of those left out
	Inliers  []string
	Outliers []string
	// root mean square reprojection error of the inliers, pixels
	RMSError float64
}

type Options struct {
	// a point is an inlier if its reprojection error is under this (pixels)
	InlierThreshold float64
	// RANSAC iterations (0: 200)
	Iterations int
	// fewest inliers to accept a pose (at least 4)
	MinInliers int
	// pose of the previous frame: tried first
	Initial *Pose
	// random source (tests); nil: a fixed seed per call
	Rand *rand.Rand
}

var ErrTooFewPoints = errors.New("too few points")
var ErrNoPose = errors.New("no pose explains the points")

func reprojError(cam Camera, pose Pose, c Correspondence) float64 {
	u, v, ok := cam.Project(pose.Apply(c.Object))
	if !ok {
		return math.Inf(1)
	}
	return math.Hypot(u-c.U, v-c.V)
}

// inliersOf are the indexes of the points under the threshold.
func inliersOf(cam Camera, pose Pose, pts []Correspondence, threshold float64) []int {
	var in []int
	for i, c := range pts {
		if reprojError(cam, pose, c) <= threshold {
			in = append(in, i)
		}
	}
	return in
}

// planarity is the ratio of the smallest to the largest spread of the points
// (0 on a plane, near 1 for a cloud of points).
func planarity(pts []Vec3) float64 {
	if len(pts) < 3 {
		return 0
	}
	var mean Vec3
	for _, p := range pts {
		mean = mean.Add(p)
	}
	mean = mean.Scale(1 / float64(len(pts)))
	cov := mat.NewSymDense(3, nil)
	for _, p := range pts {
		d := p.Sub(mean)
		for i := 0; i < 3; i++ {
			for j := i; j < 3; j++ {
				cov.SetSym(i, j, cov.At(i, j)+d[i]*d[j])
			}
		}
	}
	var eig mat.EigenSym
	if !eig.Factorize(cov, false) {
		return 0
	}
	vals := eig.Values(nil) // ascending
	if vals[2] <= 0 {
		return 0
	}
	return math.Max(vals[0], 0) / vals[2]
}

// isPlanar says whether the points lie (nearly) on a plane, where the DLT is
// not reliable and a homography is used.
func isPlanar(pts []Vec3) bool { return planarity(pts) < 0.02 }

// SolvePnP estimates the pose; see the package documentation.
//
// Every candidate pose (the previous one, a linear one from all the points,
// one from each random sample) is refined with Levenberg-Marquardt on the
// points it was made from before it is scored, because objects such as a
// floating platform with most of its keypoints on one level make the linear
// solutions rough. The score is MSAC's: the sum of the squared errors, each
// capped at the threshold, so that among poses with the same inliers the most
// accurate wins.
func SolvePnP(cam Camera, pts []Correspondence, opt Options) (Result, error) {
	if opt.InlierThreshold <= 0 {
		opt.InlierThreshold = 8
	}
	if opt.Iterations <= 0 {
		opt.Iterations = 200
	}
	if opt.MinInliers < 4 {
		opt.MinInliers = 4
	}
	if len(pts) < 4 {
		return Result{}, ErrTooFewPoints
	}
	rng := opt.Rand
	if rng == nil {
		rng = rand.New(rand.NewSource(1))
	}
	// normalized (undistorted) image coordinates, for the linear methods
	norm := make([][2]float64, len(pts))
	for i, p := range pts {
		x, y := cam.Normalize(p.U, p.V)
		norm[i] = [2]float64{x, y}
	}
	objectsOf := func(idx []int) []Vec3 {
		o := make([]Vec3, len(idx))
		for k, i := range idx {
			o[k] = pts[i].Object
		}
		return o
	}
	// the linear poses of a set of points: a homography when (nearly) planar,
	// else the DLT and, when the set is flat enough for it to help, a homography too
	linear := func(idx []int) []Pose {
		var out []Pose
		flat := planarity(objectsOf(idx))
		if flat >= 0.02 && len(idx) >= 6 {
			if p, ok := poseFromDLT(pts, norm, idx); ok {
				out = append(out, p)
			}
		}
		if flat < 0.15 {
			if p, ok := poseFromHomography(pts, norm, idx); ok {
				out = append(out, p)
			}
		}
		return out
	}
	th2 := opt.InlierThreshold * opt.InlierThreshold
	// Cauchy's robust cost: like squares for the inliers, and still growing
	// (slowly) with the error of the outliers. A capped cost (MSAC) cannot tell
	// the two mirrored poses of points nearly on a plane apart when the points
	// off the plane are outliers for both: with Cauchy's, the pose that puts
	// them 15 px off beats the one that puts them 300 px off.
	score := func(pose Pose) (float64, int) {
		var s float64
		n := 0
		for _, c := range pts {
			e := reprojError(cam, pose, c)
			if math.IsInf(e, 1) {
				s += th2 * 50 // behind the camera
				continue
			}
			s += th2 * math.Log1p(e*e/th2)
			if e*e < th2 {
				n++
			}
		}
		return s, n
	}
	bestScore := math.Inf(1)
	bestCount := 0
	var bestPose Pose
	consider := func(pose Pose, from []int, bias float64) {
		pose = refineLM(cam, pts, from, pose)
		s, n := score(pose)
		if s*bias < bestScore {
			bestScore, bestCount, bestPose = s*bias, n, pose
		}
	}
	all := allIndexes(len(pts))
	if opt.Initial != nil {
		// the pose of the previous frame wins a near tie: a video does not jump
		consider(*opt.Initial, all, 0.9)
	}
	if bestCount < len(pts) {
		for _, p := range linear(all) {
			consider(p, all, 1)
		}
	}
	sample := 6
	if len(pts) < 6 || isPlanar(objectsOf(all)) {
		sample = 4
	}
	if bestCount < len(pts) && len(pts) > sample {
		idx := make([]int, len(pts))
		for it := 0; it < opt.Iterations; it++ {
			copy(idx, all)
			rng.Shuffle(len(idx), func(a, b int) { idx[a], idx[b] = idx[b], idx[a] })
			s := append([]int(nil), idx[:sample]...)
			for _, p := range linear(s) {
				consider(p, s, 1)
			}
			// adaptive stop: enough samples to have drawn one free of
			// outliers with 99% probability, at the best inlier ratio so far
			if bestCount >= sample {
				w := math.Pow(float64(bestCount)/float64(len(pts)), float64(sample))
				needed := 1.0
				if w < 1 {
					needed = math.Log(0.01) / math.Log(1-w)
				}
				if float64(it+1) >= math.Max(needed, 3) {
					break
				}
			}
		}
	}
	inliers := inliersOf(cam, bestPose, pts, opt.InlierThreshold)
	if len(inliers) < opt.MinInliers {
		return Result{}, ErrNoPose
	}
	// refine on the inliers, and again with the inliers of the refined pose
	pose := refineLM(cam, pts, inliers, bestPose)
	if in := inliersOf(cam, pose, pts, opt.InlierThreshold); len(in) >= len(inliers) {
		inliers = in
		pose = refineLM(cam, pts, inliers, pose)
	}
	res := Result{Pose: pose}
	isIn := map[int]bool{}
	var sum float64
	for _, i := range inliers {
		isIn[i] = true
		e := reprojError(cam, pose, pts[i])
		sum += e * e
	}
	res.RMSError = math.Sqrt(sum / float64(len(inliers)))
	for i, p := range pts {
		if isIn[i] {
			res.Inliers = append(res.Inliers, p.Name)
		} else {
			res.Outliers = append(res.Outliers, p.Name)
		}
	}
	sort.Strings(res.Outliers)
	return res, nil
}

func allIndexes(n int) []int {
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	return idx
}

// normalizer of a set of 2D or 3D points: centre and scale (mean distance sqrt(d))
func similarity(points [][]float64) (mean []float64, scale float64) {
	d := len(points[0])
	mean = make([]float64, d)
	for _, p := range points {
		for k := 0; k < d; k++ {
			mean[k] += p[k]
		}
	}
	for k := range mean {
		mean[k] /= float64(len(points))
	}
	var dist float64
	for _, p := range points {
		var s float64
		for k := 0; k < d; k++ {
			s += (p[k] - mean[k]) * (p[k] - mean[k])
		}
		dist += math.Sqrt(s)
	}
	dist /= float64(len(points))
	if dist < 1e-15 {
		return mean, 1
	}
	return mean, math.Sqrt(float64(d)) / dist
}

// nullVector is the right singular vector of the smallest singular value.
func nullVector(a *mat.Dense) ([]float64, bool) {
	var svd mat.SVD
	if !svd.Factorize(a, mat.SVDFull) {
		return nil, false
	}
	var v mat.Dense
	svd.VTo(&v)
	_, c := v.Dims()
	out := make([]float64, c)
	for i := 0; i < c; i++ {
		out[i] = v.At(i, c-1)
	}
	return out, true
}

// poseFromDLT: the 3x4 projection matrix from normalized coordinates (6+
// points not on a plane), then R (nearest rotation) and t.
func poseFromDLT(pts []Correspondence, norm [][2]float64, idx []int) (Pose, bool) {
	if len(idx) < 6 {
		return Pose{}, false
	}
	p3 := make([][]float64, len(idx))
	p2 := make([][]float64, len(idx))
	for k, i := range idx {
		p3[k] = []float64{pts[i].Object[0], pts[i].Object[1], pts[i].Object[2]}
		p2[k] = []float64{norm[i][0], norm[i][1]}
	}
	m3, s3 := similarity(p3)
	m2, s2 := similarity(p2)
	a := mat.NewDense(2*len(idx), 12, nil)
	for k := range idx {
		X := (p3[k][0] - m3[0]) * s3
		Y := (p3[k][1] - m3[1]) * s3
		Z := (p3[k][2] - m3[2]) * s3
		x := (p2[k][0] - m2[0]) * s2
		y := (p2[k][1] - m2[1]) * s2
		r := 2 * k
		a.SetRow(r, []float64{X, Y, Z, 1, 0, 0, 0, 0, -x * X, -x * Y, -x * Z, -x})
		a.SetRow(r+1, []float64{0, 0, 0, 0, X, Y, Z, 1, -y * X, -y * Y, -y * Z, -y})
	}
	h, ok := nullVector(a)
	if !ok {
		return Pose{}, false
	}
	// undo the normalizations: P = T2^-1 * Pn * T3
	pn := mat.NewDense(3, 4, h)
	t2inv := mat.NewDense(3, 3, []float64{1 / s2, 0, m2[0], 0, 1 / s2, m2[1], 0, 0, 1})
	t3 := mat.NewDense(4, 4, []float64{s3, 0, 0, -s3 * m3[0], 0, s3, 0, -s3 * m3[1], 0, 0, s3, -s3 * m3[2], 0, 0, 0, 1})
	var tmp, p mat.Dense
	tmp.Mul(t2inv, pn)
	p.Mul(&tmp, t3)
	var m Mat3
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			m[i][j] = p.At(i, j)
		}
	}
	// scale: rows of R are unit vectors
	scale := 0.0
	for i := 0; i < 3; i++ {
		scale += Vec3{m[i][0], m[i][1], m[i][2]}.Norm()
	}
	scale /= 3
	if scale < 1e-15 {
		return Pose{}, false
	}
	t := Vec3{p.At(0, 3) / scale, p.At(1, 3) / scale, p.At(2, 3) / scale}
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			m[i][j] /= scale
		}
	}
	// the object in front of the camera
	c := pts[idx[0]].Object
	depth := m[2][0]*c[0] + m[2][1]*c[1] + m[2][2]*c[2] + t[2]
	if depth < 0 {
		for i := 0; i < 3; i++ {
			for j := 0; j < 3; j++ {
				m[i][j] = -m[i][j]
			}
		}
		t = t.Scale(-1)
	}
	return Pose{R: nearestRotation(m), T: t}, true
}

// poseFromHomography: points on a plane (4+). The plane is put on z=0 of a
// local frame, the homography gives [r1 r2 t].
func poseFromHomography(pts []Correspondence, norm [][2]float64, idx []int) (Pose, bool) {
	if len(idx) < 4 {
		return Pose{}, false
	}
	// local frame of the plane: origin at the mean, axes from the covariance
	objs := make([]Vec3, len(idx))
	for k, i := range idx {
		objs[k] = pts[i].Object
	}
	origin, ex, ey, ez, ok := planeFrame(objs)
	if !ok {
		return Pose{}, false
	}
	p2 := make([][]float64, len(idx))
	pl := make([][]float64, len(idx))
	for k, i := range idx {
		d := pts[i].Object.Sub(origin)
		pl[k] = []float64{d.Dot(ex), d.Dot(ey)}
		p2[k] = []float64{norm[i][0], norm[i][1]}
	}
	mp, sp := similarity(pl)
	m2, s2 := similarity(p2)
	a := mat.NewDense(2*len(idx), 9, nil)
	for k := range idx {
		X := (pl[k][0] - mp[0]) * sp
		Y := (pl[k][1] - mp[1]) * sp
		x := (p2[k][0] - m2[0]) * s2
		y := (p2[k][1] - m2[1]) * s2
		a.SetRow(2*k, []float64{X, Y, 1, 0, 0, 0, -x * X, -x * Y, -x})
		a.SetRow(2*k+1, []float64{0, 0, 0, X, Y, 1, -y * X, -y * Y, -y})
	}
	h, ok := nullVector(a)
	if !ok {
		return Pose{}, false
	}
	hn := mat.NewDense(3, 3, h)
	t2inv := mat.NewDense(3, 3, []float64{1 / s2, 0, m2[0], 0, 1 / s2, m2[1], 0, 0, 1})
	tp := mat.NewDense(3, 3, []float64{sp, 0, -sp * mp[0], 0, sp, -sp * mp[1], 0, 0, 1})
	var tmp, H mat.Dense
	tmp.Mul(t2inv, hn)
	H.Mul(&tmp, tp)
	h1 := Vec3{H.At(0, 0), H.At(1, 0), H.At(2, 0)}
	h2 := Vec3{H.At(0, 1), H.At(1, 1), H.At(2, 1)}
	h3 := Vec3{H.At(0, 2), H.At(1, 2), H.At(2, 2)}
	lambda := (h1.Norm() + h2.Norm()) / 2
	if lambda < 1e-15 {
		return Pose{}, false
	}
	if h3[2] < 0 { // the plane in front of the camera
		lambda = -lambda
	}
	r1 := h1.Scale(1 / lambda)
	r2 := h2.Scale(1 / lambda)
	t := h3.Scale(1 / lambda)
	r3 := r1.Cross(r2)
	rl := nearestRotation(Mat3{{r1[0], r2[0], r3[0]}, {r1[1], r2[1], r3[1]}, {r1[2], r2[2], r3[2]}})
	// local -> object: X_obj = origin + B * X_local, B = [ex ey ez]
	B := Mat3{{ex[0], ey[0], ez[0]}, {ex[1], ey[1], ez[1]}, {ex[2], ey[2], ez[2]}}
	R := rl.Mul(B.T())
	T := t.Sub(R.MulVec(origin))
	return Pose{R: R, T: T}, true
}

func planeFrame(pts []Vec3) (origin, ex, ey, ez Vec3, ok bool) {
	for _, p := range pts {
		origin = origin.Add(p)
	}
	origin = origin.Scale(1 / float64(len(pts)))
	cov := mat.NewSymDense(3, nil)
	for _, p := range pts {
		d := p.Sub(origin)
		for i := 0; i < 3; i++ {
			for j := i; j < 3; j++ {
				cov.SetSym(i, j, cov.At(i, j)+d[i]*d[j])
			}
		}
	}
	var eig mat.EigenSym
	if !eig.Factorize(cov, true) {
		return
	}
	var v mat.Dense
	eig.VectorsTo(&v) // ascending eigenvalues: column 0 is the normal
	ez = Vec3{v.At(0, 0), v.At(1, 0), v.At(2, 0)}.Unit()
	ex = Vec3{v.At(0, 2), v.At(1, 2), v.At(2, 2)}.Unit()
	ey = ez.Cross(ex).Unit()
	return origin, ex, ey, ez, true
}

// refineLM minimizes the reprojection error (pixels) of the points idx over
// the rotation vector and t, from pose.
func refineLM(cam Camera, pts []Correspondence, idx []int, pose Pose) Pose {
	params := [6]float64{}
	rv := RotationVector(pose.R)
	copy(params[:3], rv[:])
	copy(params[3:], pose.T[:])
	toPose := func(p [6]float64) Pose {
		return Pose{R: Rodrigues(Vec3{p[0], p[1], p[2]}), T: Vec3{p[3], p[4], p[5]}}
	}
	residuals := func(p [6]float64) []float64 {
		ps := toPose(p)
		r := make([]float64, 0, 2*len(idx))
		for _, i := range idx {
			u, v, ok := cam.Project(ps.Apply(pts[i].Object))
			if !ok {
				r = append(r, 1e4, 1e4)
				continue
			}
			r = append(r, u-pts[i].U, v-pts[i].V)
		}
		return r
	}
	cost := func(r []float64) float64 {
		var s float64
		for _, x := range r {
			s += x * x
		}
		return s
	}
	lambda := 1e-3
	r := residuals(params)
	c := cost(r)
	n := len(r)
	for iter := 0; iter < 50; iter++ {
		// numeric Jacobian
		J := mat.NewDense(n, 6, nil)
		for k := 0; k < 6; k++ {
			step := 1e-6 * math.Max(1, math.Abs(params[k]))
			pp := params
			pp[k] += step
			rp := residuals(pp)
			for i := 0; i < n; i++ {
				J.Set(i, k, (rp[i]-r[i])/step)
			}
		}
		var JtJ mat.Dense
		JtJ.Mul(J.T(), J)
		rv := mat.NewVecDense(n, r)
		var Jtr mat.VecDense
		Jtr.MulVec(J.T(), rv)
		improved := false
		for tries := 0; tries < 10; tries++ {
			A := mat.NewDense(6, 6, nil)
			A.Copy(&JtJ)
			for k := 0; k < 6; k++ {
				A.Set(k, k, A.At(k, k)*(1+lambda)+1e-12)
			}
			var delta mat.VecDense
			if err := delta.SolveVec(A, &Jtr); err != nil {
				lambda *= 10
				continue
			}
			next := params
			for k := 0; k < 6; k++ {
				next[k] -= delta.AtVec(k)
			}
			rn := residuals(next)
			if cn := cost(rn); cn < c {
				small := c-cn < 1e-12*math.Max(c, 1)
				params, r, c = next, rn, cn
				lambda = math.Max(lambda/10, 1e-9)
				improved = !small
				break
			}
			lambda *= 10
		}
		if !improved {
			break
		}
	}
	return toPose(params)
}

// ---- rays ----

// Ray of a pixel in the object's frame: origin (the camera centre) and unit direction.
func (cam Camera) RayInObject(pose Pose, u, v float64) (origin, dir Vec3) {
	x, y := cam.Normalize(u, v)
	rt := pose.R.T()
	return pose.CameraCenter(), rt.MulVec(Vec3{x, y, 1}).Unit()
}

// IntersectPlane is where a ray meets the plane through point with normal n; ok is false when parallel or behind.
func IntersectPlane(origin, dir, point, n Vec3) (Vec3, bool) {
	den := n.Dot(dir)
	if math.Abs(den) < 1e-9 {
		return Vec3{}, false
	}
	s := n.Dot(point.Sub(origin)) / den
	if s <= 0 {
		return Vec3{}, false
	}
	return origin.Add(dir.Scale(s)), true
}

// ClosestOnLine is the point of the line (point, unit direction axis) closest to the ray.
func ClosestOnLine(origin, dir, point, axis Vec3) (Vec3, bool) {
	// minimize |point + s*axis - (origin + r*dir)|
	w := point.Sub(origin)
	a, b, c := axis.Dot(axis), axis.Dot(dir), dir.Dot(dir)
	d, e := axis.Dot(w), dir.Dot(w)
	den := a*c - b*b
	if math.Abs(den) < 1e-12 {
		return Vec3{}, false
	}
	s := (b*e - c*d) / den
	return point.Add(axis.Scale(s)), true
}
