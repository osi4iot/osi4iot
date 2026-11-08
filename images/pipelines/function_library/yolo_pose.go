package function_library

// YOLO pose models (Ultralytics YOLOv8/YOLO11 "-pose" exported to ONNX).
//
// Their output is one tensor [1, C, A]: for each of the A anchors (8400
// for a 640x640 input) the box (xc, yc, w, h), one score per class and
// numKeypoints x (x, y[, visibility]) in input pixels, all as columns of a
// row-major [C, A] matrix:
//
//	C = 4 + numClasses + numKeypoints * kptDims
//
// Preprocess (in yolo.go) stretches the frame to 640x640.
// PreprocessLetterbox keeps the aspect ratio and pads with gray (114), as
// Ultralytics does when it trains and predicts: use it with models that
// were trained on frames of another aspect ratio, and pass its Scale,
// PadX and PadY to PostprocessPose so the boxes and keypoints come back in
// pixels of the original frame.
//
// From a Function node (JavaScript):
//
//	const { yolo } = Go().All();
//	const img = msg.GetImage();
//	const lb = yolo.PreprocessLetterbox(img, 640);
//	msg.payload.mlmInput = lb.data;            // -> MlModel node
//	msg.payload.letterbox = { scale: lb.scale, padX: lb.padX, padY: lb.padY,
//	                          width: lb.width, height: lb.height };
//	...
//	const lb = msg.payload.letterbox;
//	const dets = yolo.PostprocessPose(msg.payload.mlmOutput, {
//	    width: lb.width, height: lb.height, scale: lb.scale, padX: lb.padX, padY: lb.padY,
//	    classNames: ["marcador", "portico", "pulsador"], numKeypoints: 4,
//	    confThreshold: 0.3, iouThreshold: 0.7 });
//	// dets[i].Label, .ClassId, .Confidence, .X1, .Y1, .X2, .Y2,
//	// .Keypoints[k].X, .Keypoints[k].Y, .Keypoints[k].Conf

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"math"
	"sort"

	xdraw "golang.org/x/image/draw"
)

// PoseKeypoint is a keypoint in pixels of the original frame. Conf is the
// visibility score (0..1); 1 when the model has no visibility channel.
type PoseKeypoint struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Conf float64 `json:"conf"`
}

// PoseDetection is a detection of a pose model: the box in pixels of the
// original frame, its class and its keypoints.
type PoseDetection struct {
	Label      string         `json:"label"`
	ClassId    int            `json:"classId"`
	Confidence float64        `json:"confidence"`
	X1         float64        `json:"x1"`
	Y1         float64        `json:"y1"`
	X2         float64        `json:"x2"`
	Y2         float64        `json:"y2"`
	Keypoints  []PoseKeypoint `json:"keypoints"`
}

// LetterboxInput is a frame ready for a YOLO model (PreprocessLetterbox
// hands it to JavaScript as a map with the same fields in lowerCamelCase): Data is the
// 1x3xSizexSize float32 tensor (RGB, planar, 0..1). The frame was scaled
// by Scale and placed at (PadX, PadY); Width and Height are the original
// frame's size.
type LetterboxInput struct {
	Data   []float32
	Size   int
	Scale  float64
	PadX   float64
	PadY   float64
	Width  int
	Height int
}

// poseOptions are the options of PostprocessPose (see parsePoseOptions).
type poseOptions struct {
	width, height  int
	inputSize      int
	scale          float64 // 0: the frame was stretched (Preprocess)
	padX, padY     float64
	numClasses     int // 0: deduced from classNames or from the output size
	numKeypoints   int
	kptDims        int
	classNames     []string
	confThreshold  float64
	iouThreshold   float64
	maxDetections  int
	classAgnostic  bool
	bestPerClass   bool
	kptConfDefault float64
	endToEnd       string // "auto", "yes" or "no"
}

// PreprocessLetterbox turns a frame into a YOLO input of size x size
// (640 if size <= 0) keeping its aspect ratio, as Ultralytics does: the
// frame is scaled to fit and centered on a gray (114) canvas. Bilinear
// interpolation, like cv2.INTER_LINEAR.
//
// It returns a map (data, size, scale, padX, padY, width, height) rather
// than a LetterboxInput: in the JavaScript runtime a slice read from a
// struct field is exported as *[]float32, which the MlModel node does not
// take as payload.mlmInput; from a map it is exported as []float32.
func (yolo *Yolo) PreprocessLetterbox(pic image.Image, size int) map[string]interface{} {
	if pic == nil {
		err := fmt.Errorf("PreprocessLetterbox: no image")
		yolo.log.Error(err)
		yolo.node.HandleError(err)
		return nil
	}
	lb := letterboxImage(pic, size)
	return map[string]interface{}{
		"data":   lb.Data,
		"size":   lb.Size,
		"scale":  lb.Scale,
		"padX":   lb.PadX,
		"padY":   lb.PadY,
		"width":  lb.Width,
		"height": lb.Height,
	}
}

func letterboxImage(pic image.Image, size int) LetterboxInput {
	if size <= 0 {
		size = 640
	}
	b := pic.Bounds()
	w, h := b.Dx(), b.Dy()
	out := LetterboxInput{Size: size, Width: w, Height: h}
	if w <= 0 || h <= 0 {
		return out
	}

	scale := math.Min(float64(size)/float64(w), float64(size)/float64(h))
	newW := int(math.Round(float64(w) * scale))
	newH := int(math.Round(float64(h) * scale))
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}
	// Same rounding as Ultralytics' LetterBox: dw/2 - 0.1 and dw/2 + 0.1.
	dw := float64(size-newW) / 2
	dh := float64(size-newH) / 2
	left := int(math.Round(dw - 0.1))
	top := int(math.Round(dh - 0.1))

	canvas := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{color.RGBA{114, 114, 114, 255}}, image.Point{}, draw.Src)
	dst := image.Rect(left, top, left+newW, top+newH)
	parallelRows(newH, func(y0, y1 int) {
		band := canvas.SubImage(image.Rect(left, top+y0, left+newW, top+y1)).(*image.RGBA)
		xdraw.ApproxBiLinear.Scale(band, dst, pic, b, xdraw.Src, nil)
	})

	channel := size * size
	data := make([]float32, channel*3)
	pix := canvas.Pix
	parallelRows(size, func(y0, y1 int) {
		for i := y0 * size; i < y1*size; i++ {
			data[i] = float32(pix[4*i]) / 255.0
			data[channel+i] = float32(pix[4*i+1]) / 255.0
			data[2*channel+i] = float32(pix[4*i+2]) / 255.0
		}
	})

	out.Data = data
	out.Scale = scale
	out.PadX = float64(left)
	out.PadY = float64(top)
	return out
}

// PostprocessPose decodes the output of a YOLO pose model (see the top of
// this file) into detections in pixels of the original frame, after a
// non-maximum suppression per class. opts (a JavaScript object):
//
//	width, height     size of the original frame (required)
//	scale, padX, padY from PreprocessLetterbox; without scale the frame is
//	                  taken as stretched to inputSize x inputSize (Preprocess)
//	inputSize         model input size (640)
//	classNames        names of the classes, in the order of the model
//	numClasses        number of classes (default: len(classNames), or
//	                  deduced from the output size)
//	numKeypoints      keypoints per detection (required)
//	kptDims           2 (x, y) or 3 (x, y, visibility) (3)
//	confThreshold     minimum class score (0.25)
//	iouThreshold      IoU of the NMS (0.7)
//	maxDetections     maximum detections kept (300)
//	classAgnostic     NMS over all classes together (false)
//	bestPerClass      keep only the best detection of each class (false)
//	endToEnd          the export has the NMS inside the graph (Ultralytics
//	                  nms=True or end2end): rows [x1, y1, x2, y2, conf, class,
//	                  keypoints...]; true / false, or deduced from the size
func (yolo *Yolo) PostprocessPose(output []float32, opts map[string]interface{}) []PoseDetection {
	o, err := parsePoseOptions(opts)
	if err == nil {
		var dets []PoseDetection
		dets, err = decodePose(output, o)
		if err == nil {
			return dets
		}
	}
	err = fmt.Errorf("PostprocessPose: %w", err)
	yolo.log.Error(err)
	yolo.node.HandleError(err)
	return nil
}

func parsePoseOptions(opts map[string]interface{}) (poseOptions, error) {
	o := poseOptions{
		inputSize:      640,
		kptDims:        3,
		confThreshold:  0.25,
		iouThreshold:   0.7,
		maxDetections:  300,
		kptConfDefault: 1,
		endToEnd:       "auto",
	}
	num := func(key string) (float64, bool) {
		v, ok := opts[key]
		if !ok || v == nil {
			return 0, false
		}
		switch x := v.(type) {
		case float64:
			return x, true
		case float32:
			return float64(x), true
		case int:
			return float64(x), true
		case int64:
			return float64(x), true
		case int32:
			return float64(x), true
		}
		return 0, false
	}
	boolean := func(key string) bool {
		v, ok := opts[key].(bool)
		return ok && v
	}

	if v, ok := num("width"); ok {
		o.width = int(v)
	}
	if v, ok := num("height"); ok {
		o.height = int(v)
	}
	if o.width <= 0 || o.height <= 0 {
		return o, fmt.Errorf("width and height of the original frame are required")
	}
	if v, ok := num("inputSize"); ok && v > 0 {
		o.inputSize = int(v)
	}
	if v, ok := num("scale"); ok && v > 0 {
		o.scale = v
	}
	if v, ok := num("padX"); ok {
		o.padX = v
	}
	if v, ok := num("padY"); ok {
		o.padY = v
	}
	switch names := opts["classNames"].(type) {
	case []interface{}:
		for _, n := range names {
			o.classNames = append(o.classNames, fmt.Sprint(n))
		}
	case []string:
		o.classNames = append(o.classNames, names...)
	}
	if v, ok := num("numClasses"); ok && v > 0 {
		o.numClasses = int(v)
	} else {
		o.numClasses = len(o.classNames)
	}
	if v, ok := num("numKeypoints"); ok && v >= 0 {
		o.numKeypoints = int(v)
	} else {
		return o, fmt.Errorf("numKeypoints is required")
	}
	if v, ok := num("kptDims"); ok {
		if v != 2 && v != 3 {
			return o, fmt.Errorf("kptDims must be 2 or 3")
		}
		o.kptDims = int(v)
	}
	if v, ok := num("confThreshold"); ok {
		o.confThreshold = v
	}
	if v, ok := num("iouThreshold"); ok && v > 0 {
		o.iouThreshold = v
	}
	if v, ok := num("maxDetections"); ok && v > 0 {
		o.maxDetections = int(v)
	}
	o.classAgnostic = boolean("classAgnostic")
	o.bestPerClass = boolean("bestPerClass")
	if v, ok := opts["endToEnd"].(bool); ok {
		if v {
			o.endToEnd = "yes"
		} else {
			o.endToEnd = "no"
		}
	}
	return o, nil
}

func decodePose(output []float32, o poseOptions) ([]PoseDetection, error) {
	var candidates []PoseDetection
	var err error
	if isEndToEnd(output, o) {
		candidates, err = endToEndPoseCandidates(output, o)
	} else {
		candidates, err = rawPoseCandidates(output, o)
	}
	if err != nil {
		return nil, err
	}
	return poseNMS(candidates, o), nil
}

// isEndToEnd says whether the output has the NMS inside the graph: at most
// 1000 rows of 6 + keypoint columns, and not the size of a raw export.
func isEndToEnd(output []float32, o poseOptions) bool {
	switch o.endToEnd {
	case "yes":
		return true
	case "no":
		return false
	}
	rowLen := 6 + o.numKeypoints*o.kptDims
	if len(output) == 0 || len(output)%rowLen != 0 {
		return false
	}
	rows := len(output) / rowLen
	s := o.inputSize
	anchors := (s/8)*(s/8) + (s/16)*(s/16) + (s/32)*(s/32)
	return rows <= 1000 && rows != anchors
}

// frameMapper turns model input pixels into pixels of the original frame.
func frameMapper(o poseOptions) (func(x, y float64) (float64, float64), func(v, hi float64) float64) {
	toFrame := func(x, y float64) (float64, float64) {
		if o.scale > 0 {
			return (x - o.padX) / o.scale, (y - o.padY) / o.scale
		}
		return x * float64(o.width) / float64(o.inputSize), y * float64(o.height) / float64(o.inputSize)
	}
	clamp := func(v, hi float64) float64 {
		return math.Max(0, math.Min(v, hi))
	}
	return toFrame, clamp
}

// endToEndPoseCandidates reads the rows [x1, y1, x2, y2, conf, class, kpts...]
// (input pixels) of an export with the NMS inside the graph; the empty rows
// have a confidence of 0.
func endToEndPoseCandidates(output []float32, o poseOptions) ([]PoseDetection, error) {
	rowLen := 6 + o.numKeypoints*o.kptDims
	if len(output) == 0 || len(output)%rowLen != 0 {
		return nil, fmt.Errorf("output size %d is not rows of %d (x1, y1, x2, y2, conf, class + %d keypoints x %d): %s",
			len(output), rowLen, o.numKeypoints, o.kptDims, describeYoloOutput(len(output), o))
	}
	toFrame, clamp := frameMapper(o)
	candidates := make([]PoseDetection, 0, 16)
	for r := 0; r < len(output)/rowLen; r++ {
		row := output[r*rowLen : (r+1)*rowLen]
		conf := float64(row[4])
		if conf < o.confThreshold || math.IsNaN(conf) {
			continue
		}
		cls := int(math.Round(float64(row[5])))
		x1, y1 := toFrame(float64(row[0]), float64(row[1]))
		x2, y2 := toFrame(float64(row[2]), float64(row[3]))
		det := PoseDetection{
			ClassId:    cls,
			Label:      className(o.classNames, cls),
			Confidence: conf,
			X1:         clamp(x1, float64(o.width)),
			Y1:         clamp(y1, float64(o.height)),
			X2:         clamp(x2, float64(o.width)),
			Y2:         clamp(y2, float64(o.height)),
			Keypoints:  make([]PoseKeypoint, o.numKeypoints),
		}
		for k := 0; k < o.numKeypoints; k++ {
			base := 6 + k*o.kptDims
			kx, ky := toFrame(float64(row[base]), float64(row[base+1]))
			kc := o.kptConfDefault
			if o.kptDims == 3 {
				kc = float64(row[base+2])
			}
			det.Keypoints[k] = PoseKeypoint{X: kx, Y: ky, Conf: kc}
		}
		candidates = append(candidates, det)
	}
	return candidates, nil
}

// rawPoseCandidates reads a raw export: [4 + classes + keypoints] x anchors.
func rawPoseCandidates(output []float32, o poseOptions) ([]PoseDetection, error) {
	kptCols := o.numKeypoints * o.kptDims
	numClasses := o.numClasses
	// The anchors of a square input of inputSize with strides 8, 16 and 32
	// (8400 for 640).
	s := o.inputSize
	expectedAnchors := (s/8)*(s/8) + (s/16)*(s/16) + (s/32)*(s/32)
	var channels, anchors int

	if numClasses > 0 {
		channels = 4 + numClasses + kptCols
		if len(output) == 0 || len(output)%channels != 0 || len(output)/channels != expectedAnchors {
			return nil, fmt.Errorf("output size %d is not %d anchors x %d channels (4 + %d classes + %d keypoints x %d): %s",
				len(output), expectedAnchors, channels, numClasses, o.numKeypoints, o.kptDims, describeYoloOutput(len(output), o))
		}
		anchors = expectedAnchors
	} else {
		anchors = expectedAnchors
		if anchors == 0 || len(output)%anchors != 0 {
			return nil, fmt.Errorf("cannot deduce the classes from an output of %d values: give classNames or numClasses", len(output))
		}
		channels = len(output) / anchors
		numClasses = channels - 4 - kptCols
		if numClasses <= 0 {
			return nil, fmt.Errorf("output of %d channels has no room for %d keypoints x %d", channels, o.numKeypoints, o.kptDims)
		}
	}

	// From model input pixels to pixels of the original frame.
	toFrame, clamp := frameMapper(o)
	at := func(row, col int) float64 { return float64(output[row*anchors+col]) }

	candidates := make([]PoseDetection, 0, 64)
	for a := 0; a < anchors; a++ {
		best, cls := -math.MaxFloat64, 0
		for c := 0; c < numClasses; c++ {
			if s := at(4+c, a); s > best {
				best, cls = s, c
			}
		}
		if best < o.confThreshold {
			continue
		}
		xc, yc, w, h := at(0, a), at(1, a), at(2, a), at(3, a)
		x1, y1 := toFrame(xc-w/2, yc-h/2)
		x2, y2 := toFrame(xc+w/2, yc+h/2)
		det := PoseDetection{
			ClassId:    cls,
			Label:      className(o.classNames, cls),
			Confidence: best,
			X1:         clamp(x1, float64(o.width)),
			Y1:         clamp(y1, float64(o.height)),
			X2:         clamp(x2, float64(o.width)),
			Y2:         clamp(y2, float64(o.height)),
			Keypoints:  make([]PoseKeypoint, o.numKeypoints),
		}
		base := 4 + numClasses
		for k := 0; k < o.numKeypoints; k++ {
			kx, ky := toFrame(at(base+k*o.kptDims, a), at(base+k*o.kptDims+1, a))
			conf := o.kptConfDefault
			if o.kptDims == 3 {
				conf = at(base+k*o.kptDims+2, a)
			}
			det.Keypoints[k] = PoseKeypoint{X: kx, Y: ky, Conf: conf}
		}
		candidates = append(candidates, det)
	}
	return candidates, nil
}

// poseNMS keeps the best detections: per class (or all together), the best
// of each class with bestPerClass, at most maxDetections.
func poseNMS(candidates []PoseDetection, o poseOptions) []PoseDetection {
	// NMS: the best detections first.
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].Confidence > candidates[j].Confidence
	})
	kept := make([]PoseDetection, 0, len(candidates))
	seenClass := map[int]bool{}
	for _, cand := range candidates {
		if o.bestPerClass && seenClass[cand.ClassId] {
			continue
		}
		suppressed := false
		for i := range kept {
			if !o.classAgnostic && kept[i].ClassId != cand.ClassId {
				continue
			}
			if poseIoU(&kept[i], &cand) > o.iouThreshold {
				suppressed = true
				break
			}
		}
		if suppressed {
			continue
		}
		kept = append(kept, cand)
		seenClass[cand.ClassId] = true
		if len(kept) >= o.maxDetections {
			break
		}
	}
	return kept
}

func className(names []string, id int) string {
	if id >= 0 && id < len(names) {
		return names[id]
	}
	return fmt.Sprintf("class_%d", id)
}

func poseIoU(a, b *PoseDetection) float64 {
	ix1, iy1 := math.Max(a.X1, b.X1), math.Max(a.Y1, b.Y1)
	ix2, iy2 := math.Min(a.X2, b.X2), math.Min(a.Y2, b.Y2)
	inter := math.Max(0, ix2-ix1) * math.Max(0, iy2-iy1)
	union := (a.X2-a.X1)*(a.Y2-a.Y1) + (b.X2-b.X1)*(b.Y2-b.Y1) - inter
	if union <= 0 {
		return 0
	}
	return inter / union
}

// DrawPoseDetections draws the boxes (as DrawBoundingBoxes) and the
// keypoints with a visibility of at least minKptConf, numbered from 0.
func (yolo *Yolo) DrawPoseDetections(pic image.Image, dets []PoseDetection, fontSize float64, fillOpacity int, minKptConf float64) image.Image {
	if pic == nil {
		return nil
	}
	boxes := make([]BoundingBox, len(dets))
	for i, d := range dets {
		boxes[i] = BoundingBox{
			Label:      d.Label,
			Confidence: float32(d.Confidence),
			X1:         float32(d.X1), Y1: float32(d.Y1),
			X2: float32(d.X2), Y2: float32(d.Y2),
		}
	}
	drawn := yolo.DrawBoundingBoxes(pic, boxes, fontSize, fillOpacity)
	out, ok := drawn.(*image.RGBA)
	if !ok || out == nil {
		return drawn
	}

	// The keypoints in the color of their box (the same choice as
	// DrawBoundingBoxes: by label, in order of appearance).
	labelColors := make(map[string]color.RGBA, len(dets))
	for i, d := range dets {
		if _, ok := labelColors[d.Label]; !ok {
			labelColors[d.Label] = colors[i%len(colors)]
		}
	}
	radius := int(math.Max(3, fontSize/3))
	for _, d := range dets {
		col := labelColors[d.Label]
		for k, kp := range d.Keypoints {
			if kp.Conf < minKptConf {
				continue
			}
			cx, cy := int(math.Round(kp.X)), int(math.Round(kp.Y))
			fillCircle(out, cx, cy, radius+2, color.RGBA{255, 255, 255, 255})
			fillCircle(out, cx, cy, radius, col)
			_ = yolo.drawText(out, cx+radius+3, cy-radius-2, fmt.Sprint(k), color.RGBA{255, 255, 255, 255}, fontSize*0.8)
		}
	}
	return out
}

// DrawLabel writes text in white on a dark band whose top-left corner is
// (x, y), e.g. to show the values computed from the detections.
func (yolo *Yolo) DrawLabel(pic image.Image, x, y int, text string, fontSize float64) image.Image {
	if pic == nil {
		return nil
	}
	out, ok := pic.(*image.RGBA)
	if !ok {
		b := pic.Bounds()
		out = image.NewRGBA(b)
		draw.Draw(out, b, pic, b.Min, draw.Src)
	}
	padX, padY := 8, 6
	w := int(float64(len(text))*fontSize*0.6) + 2*padX
	h := int(fontSize) + 2*padY
	bg := image.Rect(x, y, x+w, y+h).Intersect(out.Bounds())
	draw.Draw(out, bg, &image.Uniform{color.NRGBA{0, 0, 0, 170}}, image.Point{}, draw.Over)
	if err := yolo.drawText(out, x+padX, y+padY+int(fontSize)-2, text, color.RGBA{255, 255, 255, 255}, fontSize); err != nil {
		yolo.node.HandleError(fmt.Errorf("error drawing text: %w", err))
	}
	return out
}

func fillCircle(img *image.RGBA, cx, cy, r int, c color.RGBA) {
	b := img.Bounds()
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			if (x-cx)*(x-cx)+(y-cy)*(y-cy) > r*r || !(image.Point{x, y}).In(b) {
				continue
			}
			img.SetRGBA(x, y, c)
		}
	}
}

// describeYoloOutput says what model an output of n values looks like, for
// the errors: the usual mistake is the MlModel node running another model.
func describeYoloOutput(n int, o poseOptions) string {
	kptCols := o.numKeypoints * o.kptDims
	nc := len(o.classNames)
	if o.numClasses > 0 {
		nc = o.numClasses
	}
	for _, size := range []int{o.inputSize, 640, 320, 224} {
		a := (size/8)*(size/8) + (size/16)*(size/16) + (size/32)*(size/32)
		if a == 0 || n%a != 0 {
			continue
		}
		ch := n / a
		guess := fmt.Sprintf("it looks like a raw export at %d px: %d anchors x %d channels", size, a, ch)
		switch rest := ch - 4; {
		case rest == 80:
			guess += " (4 + 80 classes: a COCO detection model, without keypoints)"
		case rest == 1+17*3:
			guess += " (4 + 1 class + 17 keypoints x 3: the COCO person pose model)"
		case nc > 0 && rest-nc > 0 && (rest-nc)%3 == 0:
			guess += fmt.Sprintf(" (4 + %d classes + %d keypoints x 3)", nc, (rest-nc)/3)
		case kptCols > 0 && rest-kptCols > 0:
			guess += fmt.Sprintf(" (4 + %d classes + %d keypoints x %d)", rest-kptCols, o.numKeypoints, o.kptDims)
		}
		if nc > 0 {
			guess += fmt.Sprintf("; this model, with %d classes and %d keypoints, would give %d anchors x %d (raw) or 300 x %d (NMS inside)",
				nc, o.numKeypoints, a, 4+nc+kptCols, 6+kptCols)
		}
		return guess + ". Check that the MlModel node runs the right model, and numKeypoints, classNames, inputSize and endToEnd"
	}
	for _, rows := range []int{300, 100, 1000} {
		if n%rows == 0 && n/rows > 6 {
			cols := n / rows
			return fmt.Sprintf("it looks like an export with the NMS inside: %d rows of %d (6 + %d keypoints x 3). Check numKeypoints and kptDims", rows, cols, (cols-6)/3)
		}
	}
	return "check that the MlModel node runs the right model, and numKeypoints, kptDims, classNames, inputSize and endToEnd"
}
