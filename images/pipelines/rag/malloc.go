package rag

/*
#include <stdlib.h>
#if defined(__GLIBC__)
#include <malloc.h>
static void release_freed_memory(void) { malloc_trim(0); }
#else
static void release_freed_memory(void) {}
#endif

#if defined(_WIN32)
static long long process_cpu_micros(void) { return -1; }
#else
#include <sys/resource.h>
// CPU time (user + system) of this process and of its finished children
// (pdftotext), in microseconds.
static long long process_cpu_micros(void) {
	struct rusage self, children;
	if (getrusage(RUSAGE_SELF, &self) != 0 || getrusage(RUSAGE_CHILDREN, &children) != 0) {
		return -1;
	}
	return (long long)(self.ru_utime.tv_sec + self.ru_stime.tv_sec + children.ru_utime.tv_sec + children.ru_stime.tv_sec) * 1000000LL
		+ self.ru_utime.tv_usec + self.ru_stime.tv_usec + children.ru_utime.tv_usec + children.ru_stime.tv_usec;
}
#endif
*/
import "C"

import "time"

// processCPUTime is the CPU time used so far by pipelines (all its
// threads: Go, ONNX Runtime, CUDA) and its finished child processes
// (pdftotext). ok is false where it cannot be measured (Windows).
func processCPUTime() (d time.Duration, ok bool) {
	us := int64(C.process_cpu_micros())
	if us < 0 {
		return 0, false
	}
	return time.Duration(us) * time.Microsecond, true
}

// releaseFreedMemory gives the memory freed in the C heap (ONNX Runtime,
// the tokenizer) back to the system. glibc keeps freed blocks for reuse;
// after an embedding peak that is hundreds of MB the container keeps
// paying for. Cheap: tens of milliseconds at most. Without glibc
// (macOS, musl) it does nothing.
//
// One file, no build constraints: with GOOS-specific files gopls opens a
// view per OS, and a darwin view of pipelines reports errors from every
// cgo or Linux-only dependency.
func releaseFreedMemory() {
	C.release_freed_memory()
}
