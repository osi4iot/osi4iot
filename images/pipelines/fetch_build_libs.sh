#!/bin/sh
# Leaves in assets/ the prebuilt libraries that the image build would otherwise
# download from GitHub, in the versions the build uses (like the ONNX Runtime
# libraries already there):
#   assets/tokenizers_linux_amd64/libtokenizers.a + VERSION     (version: go.mod)
#   assets/tokenizers_linux_arm64/libtokenizers.a + VERSION
#   assets/onnx_runtime_linux_amd64_gpu/libonnxruntime.so.<version> + libonnxruntime_providers_*.so
#                                       (only with "gpu"; version: ORT_VERSION_AMD64 in the Dockerfile)
# Usage, from the pipelines folder:
#   sh fetch_build_libs.sh                 download what is missing
#   sh fetch_build_libs.sh gpu             also ONNX Runtime GPU
#   sh fetch_build_libs.sh <file.tar.gz>   use an archive downloaded by hand (browser):
#                                          libtokenizers.linux-<arch>.tar.gz or onnxruntime-linux-x64-gpu-<version>.tgz
# What is already there in the right version is kept.
set -eu
cd "$(dirname "$0")"

TV=$(awk '$1 == "github.com/daulet/tokenizers" {print $2}' go.mod)
OV=$(sed -n 's/^ARG ORT_VERSION_AMD64=//p' Dockerfile | head -1)
[ -n "$TV" ] || { echo "github.com/daulet/tokenizers is not in go.mod"; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

download() { # url file
    echo "download $1"
    curl -fSL --retry 6 --retry-delay 5 --retry-all-errors "$1" -o "$2"
}

tokenizers() { # arch [archive]
    d="assets/tokenizers_linux_$1"
    if [ -z "${2:-}" ] && [ -f "$d/libtokenizers.a" ] && [ "$(cat "$d/VERSION" 2>/dev/null)" = "$TV" ]; then
        echo "ok       $d ($TV)"; return
    fi
    a=${2:-$TMP/libtokenizers.linux-$1.tar.gz}
    [ -n "${2:-}" ] || download "https://github.com/daulet/tokenizers/releases/download/${TV}/libtokenizers.linux-$1.tar.gz" "$a"
    rm -rf "$TMP/t" && mkdir -p "$TMP/t" && tar -xzf "$a" -C "$TMP/t"
    [ -f "$TMP/t/libtokenizers.a" ] || { echo "$a has no libtokenizers.a"; exit 1; }
    mkdir -p "$d" && mv "$TMP/t/libtokenizers.a" "$d/" && echo "$TV" > "$d/VERSION"
    echo "ready    $d ($TV)"
}

onnxruntime_gpu() { # [archive]
    d="assets/onnx_runtime_linux_amd64_gpu"
    if [ -z "${1:-}" ] && [ -f "$d/libonnxruntime.so.$OV" ]; then echo "ok       $d ($OV)"; return; fi
    a=${1:-$TMP/onnxruntime-gpu.tgz}
    [ -n "${1:-}" ] || download "https://github.com/microsoft/onnxruntime/releases/download/v${OV}/onnxruntime-linux-x64-gpu-${OV}.tgz" "$a"
    rm -rf "$TMP/o" && mkdir -p "$TMP/o" && tar -xzf "$a" -C "$TMP/o"
    lib=$(echo "$TMP"/o/onnxruntime-linux-x64-gpu-*/lib)
    [ -f "$lib/libonnxruntime.so.$OV" ] || { echo "$a is not ONNX Runtime GPU $OV (Dockerfile ORT_VERSION_AMD64)"; exit 1; }
    mkdir -p "$d" && cp "$lib/libonnxruntime.so.$OV" "$lib"/libonnxruntime_providers_*.so "$d/"
    echo "ready    $d ($OV)"
}

case "${1:-}" in
    *libtokenizers.linux-amd64.tar.gz) tokenizers amd64 "$1" ;;
    *libtokenizers.linux-arm64.tar.gz) tokenizers arm64 "$1" ;;
    *onnxruntime-linux-x64-gpu-*.tgz) onnxruntime_gpu "$1" ;;
    ""|gpu)
        tokenizers amd64
        tokenizers arm64
        [ "${1:-}" != "gpu" ] || onnxruntime_gpu ;;
    *) echo "unknown argument: $1 (see the head of this script)"; exit 1 ;;
esac
