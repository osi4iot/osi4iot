package function_library

import (
	"image"
	"image/color"
	"math"
	"testing"
)

// poseOutput builds a [C, A] output with the given anchors set.
type fakeAnchor struct {
	xc, yc, w, h float32
	scores       []float32
	kpts         []float32 // x, y, conf per keypoint
}

func poseOutput(numClasses, numKpts, anchors int, set map[int]fakeAnchor) []float32 {
	channels := 4 + numClasses + numKpts*3
	out := make([]float32, channels*anchors)
	for a, f := range set {
		out[0*anchors+a] = f.xc
		out[1*anchors+a] = f.yc
		out[2*anchors+a] = f.w
		out[3*anchors+a] = f.h
		for c, s := range f.scores {
			out[(4+c)*anchors+a] = s
		}
		for i, v := range f.kpts {
			out[(4+numClasses+i)*anchors+a] = v
		}
	}
	return out
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-3 }

func TestDecodePoseLetterboxAndNMS(t *testing.T) {
	const anchors = 8400
	out := poseOutput(3, 4, anchors, map[int]fakeAnchor{
		// pórtico, two overlapping boxes: the best one must be kept
		10: {320, 320, 200, 100, []float32{0, 0.60, 0}, []float32{220, 270, 0.9, 220, 370, 0.9, 420, 370, 0.9, 420, 270, 0.9}},
		11: {322, 321, 200, 100, []float32{0, 0.95, 0}, []float32{221, 271, 0.9, 221, 371, 0.9, 421, 371, 0.9, 421, 271, 0.2}},
		// pulsador, overlapping the pórtico: another class, not suppressed
		12: {300, 300, 40, 40, []float32{0, 0, 0.80}, []float32{290, 290, 0.9, 310, 290, 0.9, 310, 310, 0.9, 290, 310, 0.9}},
		// below the threshold
		13: {100, 100, 10, 10, []float32{0.2, 0, 0}, nil},
	})
	// a 1280x720 frame letterboxed into 640: scale 0.5, padY 140
	o, err := parsePoseOptions(map[string]interface{}{
		"width": int64(1280), "height": int64(720), "scale": 0.5, "padX": 0.0, "padY": int64(140),
		"classNames": []interface{}{"marcador", "portico", "pulsador"}, "numKeypoints": int64(4),
		"confThreshold": 0.3,
	})
	if err != nil {
		t.Fatal(err)
	}
	dets, err := decodePose(out, o)
	if err != nil {
		t.Fatal(err)
	}
	if len(dets) != 2 {
		t.Fatalf("expected 2 detections, got %d: %+v", len(dets), dets)
	}
	p := dets[0]
	if p.Label != "portico" || !near(p.Confidence, 0.95) {
		t.Fatalf("first detection must be the best pórtico, got %s %.2f", p.Label, p.Confidence)
	}
	// box (322±100, 321±50) -> ((x)/0.5, (y-140)/0.5)
	if !near(p.X1, 444) || !near(p.Y1, 262) || !near(p.X2, 844) || !near(p.Y2, 462) {
		t.Fatalf("wrong box %+v", p)
	}
	if !near(p.Keypoints[2].X, 842) || !near(p.Keypoints[2].Y, 462) || !near(p.Keypoints[3].Conf, 0.2) {
		t.Fatalf("wrong keypoints %+v", p.Keypoints)
	}
	if dets[1].Label != "pulsador" {
		t.Fatalf("second detection must be the pulsador, got %s", dets[1].Label)
	}
}

func TestDecodePoseStretchedAndDeducedClasses(t *testing.T) {
	const anchors = 8400
	out := poseOutput(3, 4, anchors, map[int]fakeAnchor{
		5: {320, 320, 64, 64, []float32{0.9, 0, 0}, []float32{320, 320, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0}},
	})
	o, err := parsePoseOptions(map[string]interface{}{"width": 1920.0, "height": 1080.0, "numKeypoints": 4.0})
	if err != nil {
		t.Fatal(err)
	}
	dets, err := decodePose(out, o)
	if err != nil {
		t.Fatal(err)
	}
	if len(dets) != 1 || dets[0].ClassId != 0 || dets[0].Label != "class_0" {
		t.Fatalf("unexpected %+v", dets)
	}
	if !near(dets[0].Keypoints[0].X, 960) || !near(dets[0].Keypoints[0].Y, 540) {
		t.Fatalf("stretched keypoint not scaled back: %+v", dets[0].Keypoints[0])
	}
}

func TestDecodePoseBestPerClassAndErrors(t *testing.T) {
	const anchors = 8400
	out := poseOutput(3, 4, anchors, map[int]fakeAnchor{
		1: {100, 100, 20, 20, []float32{0.7, 0, 0}, nil},
		2: {400, 400, 20, 20, []float32{0.9, 0, 0}, nil},
	})
	o, _ := parsePoseOptions(map[string]interface{}{"width": 640.0, "height": 640.0, "numKeypoints": 4.0, "numClasses": 3.0, "bestPerClass": true})
	dets, err := decodePose(out, o)
	if err != nil || len(dets) != 1 || !near(dets[0].Confidence, 0.9) {
		t.Fatalf("bestPerClass: %v %+v", err, dets)
	}
	o.numClasses = 5
	if _, err := decodePose(out, o); err == nil {
		t.Fatal("a wrong number of classes must be an error")
	}
	if _, err := parsePoseOptions(map[string]interface{}{"numKeypoints": 4.0}); err == nil {
		t.Fatal("width and height are required")
	}
}

func TestLetterboxImage(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 1280, 720))
	for y := 0; y < 720; y++ {
		for x := 0; x < 1280; x++ {
			img.SetRGBA(x, y, color.RGBA{255, 0, 0, 255})
		}
	}
	lb := letterboxImage(img, 640)
	if !near(lb.Scale, 0.5) || lb.PadX != 0 || lb.PadY != 140 || lb.Width != 1280 || lb.Height != 720 {
		t.Fatalf("unexpected letterbox %+v", lb)
	}
	if len(lb.Data) != 3*640*640 {
		t.Fatalf("data size %d", len(lb.Data))
	}
	const ch = 640 * 640
	// padding is gray 114, the frame red
	if v := lb.Data[0]; !near(float64(v), 114.0/255) {
		t.Fatalf("padding R = %v", v)
	}
	mid := 320*640 + 320
	if lb.Data[mid] != 1 || lb.Data[ch+mid] != 0 || lb.Data[2*ch+mid] != 0 {
		t.Fatalf("frame pixel = %v %v %v", lb.Data[mid], lb.Data[ch+mid], lb.Data[2*ch+mid])
	}
}
