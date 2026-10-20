package nodes

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"pipelines/logger"

	ort "github.com/yalue/onnxruntime_go"
)

// ONNX Runtime execution providers
//
// The same image runs on nodes with and without a GPU, so the provider is
// chosen per session, at runtime:
//
//   - "auto" (default): CUDA when the container can see an NVIDIA GPU,
//     CPU otherwise.
//   - "cuda":     CUDA, falling back to CPU if it cannot be used.
//   - "tensorrt": TensorRT, then CUDA for what TensorRT does not take,
//     falling back to CPU. Needs the TensorRT libraries in the image.
//   - "cpu":      CPU only.
//
// The node setting "executionProvider" wins over the ORT_EXECUTION_PROVIDER
// environment variable, which the CLI sets on the whole service.
//
// Every fallback is logged: a model silently running on CPU on a GPU node
// is exactly the kind of thing nobody notices until it is too slow.

const (
	ProviderAuto     = "auto"
	ProviderCPU      = "cpu"
	ProviderCUDA     = "cuda"
	ProviderTensorRT = "tensorrt"
)

var (
	ortInitOnce sync.Once
	ortInitErr  error

	// cudaBroken is set once CUDA has failed with a "sticky" error: the
	// process's CUDA context is then unusable until the process restarts.
	cudaBroken       atomic.Bool
	cudaBrokenReason atomic.Value // string
)

// stickyCUDAErrors are failures after which every CUDA call of the
// process fails: a kernel crashed or the device was lost (typically a
// laptop resuming from suspend, or an Xid error in dmesg). Nothing short
// of restarting the process recovers the GPU.
var stickyCUDAErrors = []string{
	"CUDA failure 700:", // illegal address
	"CUDA failure 719:", // unspecified launch failure
	"CUDA failure 999:", // unknown error
	"CUDA failure 214:", // uncorrectable ECC error
	"unspecified launch failure",
	"illegal memory access",
}

// IsStickyCUDAError reports whether err means the CUDA context is gone.
func IsStickyCUDAError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, s := range stickyCUDAErrors {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}

// MarkCUDABroken records that CUDA is unusable in this process: new
// sessions go to CPU, ProbeGPU answers false and the replica stops
// announcing itself as a GPU replica. Restarting pipelines brings the GPU
// back (once the driver is healthy again).
func MarkCUDABroken(err error, log *logger.Logger) {
	if cudaBroken.CompareAndSwap(false, true) {
		cudaBrokenReason.Store(err.Error())
		log.Errorf("CUDA failed with a non-recoverable error; ONNX models of this replica run on CPU "+
			"until pipelines is restarted: %v", err)
	}
}

// CUDABroken reports whether MarkCUDABroken was called, and why.
func CUDABroken() (bool, string) {
	if !cudaBroken.Load() {
		return false, ""
	}
	reason, _ := cudaBrokenReason.Load().(string)
	return true, reason
}

// initONNXRuntime loads the shared library and creates the ORT environment
// exactly once per process. Several MlModel nodes start concurrently; the
// previous IsInitialized()/InitializeEnvironment() pair raced between them.
func initONNXRuntime(libPath string, log *logger.Logger) error {
	ortInitOnce.Do(func() {
		if p := os.Getenv("ONNXRUNTIME_SHARED_LIB"); p != "" {
			libPath = p
		}
		ort.SetSharedLibraryPath(libPath)
		if err := ort.InitializeEnvironment(); err != nil {
			ortInitErr = fmt.Errorf("error initializing ORT environment: %w", err)
			return
		}
		log.Infof("ONNX Runtime initialized with library: %s (GPU visible: %v)", libPath, gpuVisible())
	})
	return ortInitErr
}

// gpuVisible is a cheap hint that an NVIDIA GPU may be usable, so that
// machines without one never pay for loading the CUDA provider:
//   - Linux, native or in a container with the NVIDIA runtime: /dev/nvidiactl
//   - WSL2: the GPU is exposed through /dev/dxg
//   - Windows: no device file to look at; the CUDA probe decides.
//
// It is only a hint: ProbeGPU and session creation confirm it with CUDA.
func gpuVisible() bool {
	if runtime.GOOS == "windows" {
		return true
	}
	for _, dev := range []string{"/dev/nvidiactl", "/dev/dxg"} {
		if _, err := os.Stat(dev); err == nil {
			return true
		}
	}
	return false
}

// requestedProvider returns the provider asked for by the node settings,
// else by the environment, else "auto".
func requestedProvider(settings map[string]any) string {
	if v, ok := settings["executionProvider"].(string); ok && strings.TrimSpace(v) != "" {
		return strings.ToLower(strings.TrimSpace(v))
	}
	if v := os.Getenv("ORT_EXECUTION_PROVIDER"); v != "" {
		return strings.ToLower(strings.TrimSpace(v))
	}
	return ProviderAuto
}

// providerCandidates lists, in order, the providers to try for a request.
// The last one is always CPU, which cannot fail for lack of hardware.
func providerCandidates(requested string) []string {
	if cudaBroken.Load() {
		return []string{ProviderCPU}
	}
	switch requested {
	case ProviderCPU:
		return []string{ProviderCPU}
	case ProviderCUDA:
		return []string{ProviderCUDA, ProviderCPU}
	case ProviderTensorRT:
		return []string{ProviderTensorRT, ProviderCUDA, ProviderCPU}
	default: // auto, or anything unknown
		if gpuVisible() {
			return []string{ProviderCUDA, ProviderCPU}
		}
		return []string{ProviderCPU}
	}
}

// newSessionOptions builds the session options for one provider. The
// caller owns the result and must Destroy it.
func newSessionOptions(provider string) (*ort.SessionOptions, error) {
	options, err := ort.NewSessionOptions()
	if err != nil {
		return nil, fmt.Errorf("error creating session options: %w", err)
	}
	if err := options.SetIntraOpNumThreads(intraOpThreads()); err != nil {
		options.Destroy()
		return nil, fmt.Errorf("error setting intra-op threads: %w", err)
	}

	switch provider {
	case ProviderCPU:
		// Nothing to append: CPU is always ORT's last-resort provider.
	case ProviderCUDA:
		if err := appendCUDA(options); err != nil {
			options.Destroy()
			return nil, err
		}
	case ProviderTensorRT:
		if err := appendTensorRT(options); err != nil {
			options.Destroy()
			return nil, err
		}
		// Operators TensorRT does not support go to CUDA, not to CPU.
		if err := appendCUDA(options); err != nil {
			options.Destroy()
			return nil, err
		}
	default:
		options.Destroy()
		return nil, fmt.Errorf("unknown execution provider %q", provider)
	}
	return options, nil
}

func appendCUDA(options *ort.SessionOptions) error {
	cudaOptions, err := ort.NewCUDAProviderOptions()
	if err != nil {
		return fmt.Errorf("CUDA provider not available in this ONNX Runtime build: %w", err)
	}
	defer cudaOptions.Destroy()

	cfg := map[string]string{
		"device_id": envOr("ORT_CUDA_DEVICE_ID", "0"),
		// Grow the arena only by what is asked for. With several models
		// (and several pipelines replicas) on one GPU, the default
		// power-of-two growth runs out of memory long before it should.
		"arena_extend_strategy": "kSameAsRequested",
		// HEURISTIC avoids the very slow first inference EXHAUSTIVE
		// causes on convolutional models such as YOLO.
		"cudnn_conv_algo_search": envOr("ORT_CUDA_CONV_ALGO_SEARCH", "HEURISTIC"),
	}
	if limit := os.Getenv("ORT_CUDA_MEM_LIMIT"); limit != "" {
		cfg["gpu_mem_limit"] = limit // bytes, per session
	}
	if err := cudaOptions.Update(cfg); err != nil {
		return fmt.Errorf("error configuring CUDA provider: %w", err)
	}
	if err := options.AppendExecutionProviderCUDA(cudaOptions); err != nil {
		return fmt.Errorf("error enabling CUDA provider: %w", err)
	}
	return nil
}

func appendTensorRT(options *ort.SessionOptions) error {
	trtOptions, err := ort.NewTensorRTProviderOptions()
	if err != nil {
		return fmt.Errorf("TensorRT provider not available in this ONNX Runtime build: %w", err)
	}
	defer trtOptions.Destroy()

	cfg := map[string]string{
		"device_id": envOr("ORT_CUDA_DEVICE_ID", "0"),
		// Building a TensorRT engine takes from seconds to minutes; the
		// cache in the replica's volume makes it a one-time cost.
		"trt_engine_cache_enable": "1",
		"trt_engine_cache_path":   envOr("ORT_TRT_CACHE_PATH", "/pipelines/data/trt_cache"),
		"trt_fp16_enable":         envOr("ORT_TRT_FP16", "0"),
	}
	if err := trtOptions.Update(cfg); err != nil {
		return fmt.Errorf("error configuring TensorRT provider: %w", err)
	}
	if err := options.AppendExecutionProviderTensorRT(trtOptions); err != nil {
		return fmt.Errorf("error enabling TensorRT provider: %w", err)
	}
	return nil
}

// newSessionWithFallback creates the session with the first provider of
// the candidates that works, and returns which one it was.
func newSessionWithFallback(
	modelData []byte,
	inputNames, outputNames []string,
	inputs, outputs []ort.Value,
	requested string,
	log *logger.Logger,
) (*ort.AdvancedSession, string, error) {
	candidates := providerCandidates(requested)
	var errs []string

	for _, provider := range candidates {
		options, err := newSessionOptions(provider)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", provider, err))
			log.Warnf("Execution provider %s not usable: %v", provider, err)
			continue
		}
		session, err := ort.NewAdvancedSessionWithONNXData(modelData, inputNames, outputNames, inputs, outputs, options)
		options.Destroy()
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", provider, err))
			log.Warnf("Could not create ORT session with %s: %v", provider, err)
			continue
		}
		if provider != candidates[0] {
			log.Warnf("ONNX model running on %s instead of %s (requested: %s)", provider, candidates[0], requested)
		}
		return session, provider, nil
	}
	return nil, "", fmt.Errorf("no execution provider could create the session: %s", strings.Join(errs, "; "))
}

// intraOpThreads is the size of ORT's CPU thread pool for a session.
//
// ORT's default is one thread per core of the MACHINE, ignoring the
// container's CPU limit. A pipelines task limited to, say, 1 CPU on a
// 20-thread host then runs 20 threads on 1 CPU of quota: the kernel
// throttles them all the time and a 15 ms inference takes close to a
// second. GOMAXPROCS honours the cgroup CPU limit since Go 1.25, so it
// is the right number. ORT_INTRA_OP_THREADS overrides it.
func intraOpThreads() int {
	if v := os.Getenv("ORT_INTRA_OP_THREADS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return runtime.GOMAXPROCS(0)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Local GPU build of ONNX Runtime, for running the binary outside Docker
// on a machine with an NVIDIA GPU: libonnxruntime.so.<version> plus its
// libonnxruntime_providers_*.so, all in this folder (ORT loads the
// providers from the directory of the main library). The folder is in
// .dockerignore: the -gpu image installs its own build at the CPU path.
const localGpuLibDir = "./assets/onnx_runtime_linux_amd64_gpu"

// A real libonnxruntime is tens of MB; a Git LFS pointer left by a clone
// without "git lfs pull" is ~130 bytes and would break ORT entirely.
const minRealLibSize = 1 << 20

// defaultSharedLibPath is the ONNX Runtime library to load when
// ONNXRUNTIME_SHARED_LIB does not name one.
//
// On linux/amd64 it prefers the local GPU build (localGpuLibDir) when a
// GPU is visible and the folder holds a real library; otherwise the CPU
// build, which is also where the -gpu image puts its GPU build.
func defaultSharedLibPath() string {
	switch runtime.GOOS {
	case "linux":
		if runtime.GOARCH == "arm64" {
			return "./assets/onnx_runtime_linux_arm64/onnxruntime_arm64.so"
		}
		if gpuVisible() {
			if lib := localGpuLib(); lib != "" {
				return lib
			}
		}
		return "./assets/onnx_runtime_linux_amd64/onnxruntime.so"
	case "darwin":
		return "./assets/onnx_runtime_darwin/onnxruntime.dylib"
	case "windows":
		return "./assets/onnx_runtime_windows/onnxruntime.dll"
	default:
		panic(fmt.Sprintf("Unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH))
	}
}

// localGpuLib returns the versioned libonnxruntime.so.X.Y.Z in
// localGpuLibDir (the last in name order, if there are several), or "" when there is
// none, or only symlinks or LFS pointers. The CUDA provider must be next
// to it too: without it the GPU build would only ever run on CPU.
func localGpuLib() string {
	if !isRealLib(filepath.Join(localGpuLibDir, "libonnxruntime_providers_cuda.so")) {
		return ""
	}
	matches, _ := filepath.Glob(filepath.Join(localGpuLibDir, "libonnxruntime.so.*.*.*"))
	sort.Strings(matches)
	for i := len(matches) - 1; i >= 0; i-- {
		if isRealLib(matches[i]) {
			return matches[i]
		}
	}
	return ""
}

func isRealLib(path string) bool {
	info, err := os.Lstat(path)
	return err == nil && info.Mode().IsRegular() && info.Size() >= minRealLibSize
}

// ProbeGPU reports whether this replica can really run ONNX models on
// CUDA, and why not when it cannot:
//
//  1. PIPELINES_GPU_CAPABLE=true|false forces the answer. Meant for
//     running the binary on a development machine: "true" without a GPU
//     lets you test which replica gets the pipelines that require GPU
//     (the models then run on CPU); "false" makes a GPU machine behave
//     as a CPU replica.
//  2. Some NVIDIA GPU device is visible (see gpuVisible).
//  3. ONNX Runtime loads its CUDA provider and configures the device:
//     a CPU-only build, missing CUDA/cuDNN libraries or a driver too old
//     for CUDA 12.8 all fail here.
//
// The image tag is deliberately not part of it: the GPU image also runs
// on nodes without GPU, and a binary run outside Docker has no image.
func ProbeGPU(log *logger.Logger) (bool, string) {
	switch strings.ToLower(os.Getenv("PIPELINES_GPU_CAPABLE")) {
	case "true", "1", "yes":
		return true, "forced by PIPELINES_GPU_CAPABLE"
	case "false", "0", "no":
		return false, "forced by PIPELINES_GPU_CAPABLE"
	}
	if broken, reason := CUDABroken(); broken {
		return false, "CUDA failed at runtime: " + reason
	}
	if !gpuVisible() {
		return false, "no NVIDIA GPU visible"
	}
	if err := initONNXRuntime(defaultSharedLibPath(), log); err != nil {
		return false, err.Error()
	}
	cudaOptions, err := ort.NewCUDAProviderOptions()
	if err != nil {
		return false, fmt.Sprintf("CUDA provider not available: %v", err)
	}
	defer cudaOptions.Destroy()
	if err := cudaOptions.Update(map[string]string{"device_id": envOr("ORT_CUDA_DEVICE_ID", "0")}); err != nil {
		return false, fmt.Sprintf("CUDA device not usable: %v", err)
	}
	return true, "CUDA available"
}
