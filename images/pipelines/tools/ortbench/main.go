// ortbench measures ONNX Runtime inference on CPU and on CUDA for one
// model, outside the platform, to answer "is the GPU really being used?".
//
//	go run ./tools/ortbench -model path/to/model.onnx
//	go run ./tools/ortbench -model m.onnx -lib ./assets/onnx_runtime_linux_amd64_gpu/libonnxruntime.so.1.25.1
//
// It prints, per provider, the session creation time, the first run
// (CUDA's includes the warm-up: kernel loading, cuDNN algorithm search)
// and the median and p90 of the following runs. A provider that cannot be
// used says why: that error is the real reason a pipeline falls back to CPU.
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync/atomic"
	"time"

	ort "github.com/yalue/onnxruntime_go"
)

func main() {
	model := flag.String("model", "", "path to the .onnx model (required)")
	lib := flag.String("lib", "", "ONNX Runtime library (default: ONNXRUNTIME_SHARED_LIB, else the GPU folder, else the CPU one)")
	runs := flag.Int("n", 50, "timed runs per provider, after the first one")
	providers := flag.String("providers", "cpu,cuda", "providers to measure: cpu, cuda or cpu,cuda")
	device := flag.String("device", "0", "CUDA device_id")
	threads := flag.String("threads", "same", "OS thread of each timed run: same (one pinned thread) or new (a fresh thread per run, the worst case of Go moving goroutines between threads)")
	cpuLoad := flag.Int("cpuload", 0, "goroutines kept 100% busy during the timed runs, to imitate the rest of the pipeline using the CPU")
	intra := flag.Int("intra", 0, "ORT intra-op CPU threads (0 = ORT default: one per core)")
	spin := flag.Bool("spin", true, "let ORT's CPU threads busy-wait between runs (ORT default)")
	interval := flag.Duration("interval", 0, "pause between timed runs (e.g. 2s) to imitate messages arriving one by one; 0 = back to back")
	flag.Parse()
	if *model == "" {
		flag.Usage()
		os.Exit(2)
	}

	libPath := pickLib(*lib)
	fmt.Printf("library:     %s\n", libPath)
	ort.SetSharedLibraryPath(libPath)
	if err := ort.InitializeEnvironment(); err != nil {
		fail("cannot load ONNX Runtime: %v", err)
	}
	defer ort.DestroyEnvironment()
	fmt.Printf("ORT version: %s\n", ort.GetVersion())
	fmt.Printf("GPU device:  /dev/nvidiactl=%v /dev/dxg=%v\n", exists("/dev/nvidiactl"), exists("/dev/dxg"))
	fmt.Printf("LD_LIBRARY_PATH=%s\n\n", os.Getenv("LD_LIBRARY_PATH"))

	inputs, outputs, err := ort.GetInputOutputInfo(*model)
	if err != nil {
		fail("cannot read model: %v", err)
	}

	for _, p := range splitComma(*providers) {
		bench(p, *model, inputs, outputs, *runs, *device, *interval, *threads, benchOpts{*cpuLoad, *intra, *spin})
	}
}

func bench(provider, model string, inInfo, outInfo []ort.InputOutputInfo, runs int, device string, interval time.Duration, threads string, bo benchOpts) {
	// All set-up and the first run on one pinned thread.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	fmt.Printf("== %s\n", provider)

	options, err := ort.NewSessionOptions()
	if err != nil {
		fail("session options: %v", err)
	}
	defer options.Destroy()
	if bo.intra > 0 {
		if err := options.SetIntraOpNumThreads(bo.intra); err != nil {
			fail("intra-op threads: %v", err)
		}
	}
	if !bo.spin {
		if err := options.AddSessionConfigEntry("session.intra_op.allow_spinning", "0"); err != nil {
			fail("allow_spinning: %v", err)
		}
	}

	if provider == "cuda" {
		cuda, err := ort.NewCUDAProviderOptions()
		if err != nil {
			fmt.Printf("   NOT USABLE: this ONNX Runtime build has no CUDA provider: %v\n\n", err)
			return
		}
		defer cuda.Destroy()
		// Same settings as pipelines (nodes/onnxRuntime.go).
		if err := cuda.Update(map[string]string{
			"device_id":              device,
			"arena_extend_strategy":  "kSameAsRequested",
			"cudnn_conv_algo_search": "HEURISTIC",
		}); err != nil {
			fmt.Printf("   NOT USABLE: %v\n\n", err)
			return
		}
		if err := options.AppendExecutionProviderCUDA(cuda); err != nil {
			fmt.Printf("   NOT USABLE: %v\n\n", err)
			return
		}
	}

	inVals, inNames, err := makeTensors(inInfo, true)
	if err != nil {
		fmt.Printf("   %v\n\n", err)
		return
	}
	outVals, outNames, err := makeTensors(outInfo, false)
	if err != nil {
		fmt.Printf("   %v\n\n", err)
		return
	}
	defer destroyAll(inVals)
	defer destroyAll(outVals)

	t0 := time.Now()
	session, err := ort.NewAdvancedSession(model, inNames, outNames, inVals, outVals, options)
	if err != nil {
		fmt.Printf("   NOT USABLE: cannot create session: %v\n\n", err)
		return
	}
	defer session.Destroy()
	fmt.Printf("   session created in %v\n", time.Since(t0).Round(time.Millisecond))

	t0 = time.Now()
	if err := session.Run(); err != nil {
		fmt.Printf("   run failed: %v\n\n", err)
		return
	}
	fmt.Printf("   first run:  %v (includes warm-up)\n", time.Since(t0).Round(100*time.Microsecond))

	if interval > 0 {
		fmt.Printf("   pause between runs: %v\n", interval)
	}
	fmt.Printf("   threads:    %s   intra-op: %d   spinning: %v   cpu load: %d goroutines\n", threads, bo.intra, bo.spin, bo.cpuLoad)
	var stopLoad atomic.Bool
	for i := 0; i < bo.cpuLoad; i++ {
		go func() {
			x := 0
			for !stopLoad.Load() {
				x++
			}
			_ = x
		}()
	}
	defer stopLoad.Store(true)
	times := make([]time.Duration, runs)
	for i := range times {
		if interval > 0 {
			time.Sleep(interval)
		}
		if threads == "new" {
			// A goroutine that locks its thread and exits without
			// unlocking takes the thread with it: the next run gets
			// a brand-new OS thread.
			type res struct {
				d   time.Duration
				err error
			}
			ch := make(chan res)
			go func() {
				runtime.LockOSThread()
				t := time.Now()
				err := session.Run()
				ch <- res{time.Since(t), err}
			}()
			r := <-ch
			if r.err != nil {
				fmt.Printf("   run failed: %v\n\n", r.err)
				return
			}
			times[i] = r.d
			continue
		}
		t0 = time.Now()
		if err := session.Run(); err != nil {
			fmt.Printf("   run failed: %v\n\n", err)
			return
		}
		times[i] = time.Since(t0)
	}
	sort.Slice(times, func(i, j int) bool { return times[i] < times[j] })
	fmt.Printf("   median:     %v\n", times[len(times)/2].Round(100*time.Microsecond))
	fmt.Printf("   p90:        %v   (%d runs)\n", times[len(times)*9/10].Round(100*time.Microsecond), runs)
	fmt.Printf("   max:        %v\n\n", times[len(times)-1].Round(100*time.Microsecond))
}

type benchOpts struct {
	cpuLoad int
	intra   int
	spin    bool
}

// makeTensors builds one tensor per model input/output; dynamic
// dimensions (-1) become 1. Inputs are filled with random data.
func makeTensors(info []ort.InputOutputInfo, fill bool) ([]ort.Value, []string, error) {
	vals := make([]ort.Value, 0, len(info))
	names := make([]string, 0, len(info))
	for _, io := range info {
		dims := make([]int64, len(io.Dimensions))
		size := int64(1)
		for i, d := range io.Dimensions {
			if d < 0 {
				d = 1
			}
			dims[i] = d
			size *= d
		}
		shape := ort.NewShape(dims...)
		switch io.DataType {
		case ort.TensorElementDataTypeFloat:
			data := make([]float32, size)
			if fill {
				for i := range data {
					data[i] = rand.Float32()
				}
			}
			t, err := ort.NewTensor(shape, data)
			if err != nil {
				destroyAll(vals)
				return nil, nil, err
			}
			vals = append(vals, t)
		default:
			destroyAll(vals)
			return nil, nil, fmt.Errorf("%q has type %v: ortbench only handles float32 tensors", io.Name, io.DataType)
		}
		names = append(names, io.Name)
	}
	return vals, names, nil
}

// pickLib mirrors pipelines' choice: flag, ONNXRUNTIME_SHARED_LIB, the
// local GPU folder, the CPU library.
func pickLib(flagValue string) string {
	if flagValue != "" {
		return flagValue
	}
	if p := os.Getenv("ONNXRUNTIME_SHARED_LIB"); p != "" {
		return p
	}
	if runtime.GOOS == "linux" && runtime.GOARCH == "amd64" {
		matches, _ := filepath.Glob("./assets/onnx_runtime_linux_amd64_gpu/libonnxruntime.so.*.*.*")
		if len(matches) > 0 {
			return matches[len(matches)-1]
		}
		return "./assets/onnx_runtime_linux_amd64/onnxruntime.so"
	}
	if runtime.GOOS == "linux" {
		return "./assets/onnx_runtime_linux_arm64/onnxruntime_arm64.so"
	}
	fail("pass -lib on %s", runtime.GOOS)
	return ""
}

func destroyAll(vals []ort.Value) {
	for _, v := range vals {
		v.Destroy()
	}
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

func splitComma(s string) []string {
	var out []string
	cur := ""
	for _, r := range s + "," {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	return out
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "ortbench: "+format+"\n", args...)
	os.Exit(1)
}
