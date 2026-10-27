# syntax=docker/dockerfile:1
########################################
# 0) Python builder: crea venv con uv
########################################
FROM python:3.12-slim AS python-builder

# Instalar uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /mcp_servers_python

COPY mcp_servers/mcp_calculate_server/ ./mcp_calculate_server/

# Crear venv e instalar el paquete (no editable -> queda embebido en el venv).
# The dependencies are the exact versions of uv.lock (with their hashes),
# not whatever is newest on PyPI when the image is built: an unpinned
# resolve once brought in mcp 2.x, which dropped mcp.server.fastmcp, and
# the server no longer started. To upgrade them: `uv lock --upgrade` in
# mcp_servers/mcp_calculate_server, and commit uv.lock.
RUN uv venv /opt/venv \
    && cd mcp_calculate_server \
    && uv export --frozen --no-dev --no-emit-project --quiet -o /tmp/requirements.txt \
    && VIRTUAL_ENV=/opt/venv uv pip install --require-hashes -r /tmp/requirements.txt \
    && VIRTUAL_ENV=/opt/venv uv pip install --no-deps . \
    && rm /tmp/requirements.txt

########################################
# 1) Go builder: compila binarios (enlace estático)
########################################
# Go 1.26: required by agent-sdk-go (the AiAgent nodes' agents).
FROM golang:1.26-bookworm AS builder
ARG TARGETARCH

WORKDIR /src

COPY go.mod go.sum ./
COPY main.go ./
COPY admin/ ./admin/
COPY common/ ./common/
COPY config/ ./config/
COPY duckdb/ ./duckdb/
COPY flows_manager/ ./flows_manager/
COPY function_library/ ./function_library/
COPY leader_election/ ./leader_election/
COPY llmagent/ ./llmagent/
COPY iotdb/ ./iotdb/
COPY logger/ ./logger/
COPY message/ ./message/
COPY nats/ ./nats/
COPY nodes/ ./nodes/
COPY s3folder/ ./s3folder/
COPY telegram/ ./telegram/
COPY timeparser/ ./timeparser/
COPY utils/ ./utils/
COPY rag/ ./rag/
RUN go mod download && go mod verify

# libtokenizers.a (Hugging Face tokenizers, Rust) for the knowledge bases'
# embedding model: the prebuilt static library of the version in go.mod.
RUN TOKENIZERS_VERSION=$(awk '$1 == "github.com/daulet/tokenizers" {print $2}' go.mod) \
    && test -n "$TOKENIZERS_VERSION" \
    && mkdir -p /usr/local/lib/tokenizers \
    && curl -fsSL "https://github.com/daulet/tokenizers/releases/download/${TOKENIZERS_VERSION}/libtokenizers.linux-${TARGETARCH}.tar.gz" \
       | tar -xz -C /usr/local/lib/tokenizers

# pipelines
RUN CGO_ENABLED=1 CC=gcc CGO_LDFLAGS="-L/usr/local/lib/tokenizers" \
    go build -ldflags="-s -w" -o /usr/local/bin/pipelines .

# doc_info (MCP server: the agents' documents, read from the bucket).
# Part of the pipelines module, so it shares its go.mod: only main.go is
# copied, so a go.mod left in its folder (which would make it a separate
# module, outside pipelines) cannot break the build.
COPY mcp_servers/doc_info/main.go ./mcp_servers/doc_info/
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /usr/local/bin/doc_info ./mcp_servers/doc_info

# current_date
COPY mcp_servers/current_date/go.mod ./mcp_servers/current_date/
COPY mcp_servers/current_date/go.sum ./mcp_servers/current_date/
COPY mcp_servers/current_date/main.go ./mcp_servers/current_date/
RUN cd mcp_servers/current_date && go mod download && go mod verify
RUN cd mcp_servers/current_date && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /usr/local/bin/current_date .

# fem_results (CGO pero enlace estático → no copia de .so)
COPY mcp_servers/fem_results/go.mod ./mcp_servers/fem_results/
COPY mcp_servers/fem_results/go.sum ./mcp_servers/fem_results/
COPY mcp_servers/fem_results/main.go ./mcp_servers/fem_results/
RUN cd mcp_servers/fem_results && go mod download && go mod verify
RUN cd mcp_servers/fem_results && \
    CGO_ENABLED=1 CC=gcc \
    go build -ldflags="-s -w" -o /usr/local/bin/fem_results .

########################################
# 1b) GPU libraries (only with ORT_FLAVOR=gpu)
#
#  - ONNX Runtime GPU build: libonnxruntime + its CUDA provider libraries,
#    which ORT loads from the directory of libonnxruntime.
#  - CUDA + cuDNN user-space libraries, from NVIDIA's pip wheels. The
#    driver (libcuda.so) is NOT here: the NVIDIA container runtime
#    injects the host's one when the container starts on a GPU node.
#
#  amd64: ORT 1.25.1, official GPU tarball, CUDA 12.8 + cuDNN 9.
#  arm64: ORT 1.31.0, CUDA 13 + cuDNN 9 (e.g. AWS g5g, Graviton2 + T4G).
#         Microsoft publishes no Linux ARM64 GPU tarball; the libraries
#         come from the official onnxruntime-gpu wheel, which ships the
#         C API library (libonnxruntime.so) next to the CUDA provider.
#         onnxruntime_go (C API 23) works with it: newer ORT versions keep
#         serving older API versions. Needs an NVIDIA driver >= 580 (CUDA
#         13) on the host.
#
# Runs on the BUILD platform and fetches the TARGET's wheels with
# "pip --platform", so the arm64 image needs no QEMU emulation.
# With ORT_FLAVOR=cpu both output folders stay empty and the image is the
# same as before.
########################################
FROM --platform=$BUILDPLATFORM python:3.12-slim AS gpu-libs
ARG TARGETARCH
ARG ORT_FLAVOR=cpu
ARG ORT_VERSION_AMD64=1.25.1
ARG ORT_VERSION_ARM64=1.31.0

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /out/ort /opt/nvidia \
    && if [ "$ORT_FLAVOR" = "gpu" ] && [ "$TARGETARCH" = "amd64" ]; then \
         V=${ORT_VERSION_AMD64} \
         && curl -fsSL "https://github.com/microsoft/onnxruntime/releases/download/v${V}/onnxruntime-linux-x64-gpu-${V}.tgz" \
           | tar xz -C /tmp \
         && cp "/tmp/onnxruntime-linux-x64-gpu-${V}/lib/libonnxruntime.so.${V}" /out/ort/onnxruntime.so \
         && cp /tmp/onnxruntime-linux-x64-gpu-${V}/lib/libonnxruntime_providers_*.so /out/ort/ \
         && pip install --no-cache-dir --no-deps --target /opt/nvidia \
              --only-binary=:all: --python-version 3.12 --implementation cp \
              --platform manylinux2014_x86_64 --platform manylinux_2_17_x86_64 \
              --platform manylinux_2_27_x86_64 --platform manylinux_2_28_x86_64 \
              "nvidia-cuda-runtime-cu12==12.8.90" \
              "nvidia-cublas-cu12==12.8.4.1" \
              "nvidia-cufft-cu12==11.3.3.83" \
              "nvidia-curand-cu12==10.3.9.90" \
              "nvidia-cudnn-cu12==9.10.2.21" \
         && rm -rf /tmp/onnxruntime-linux-x64-gpu-*; \
       elif [ "$ORT_FLAVOR" = "gpu" ] && [ "$TARGETARCH" = "arm64" ]; then \
         V=${ORT_VERSION_ARM64} \
         && pip download --no-cache-dir --no-deps -d /tmp/ortwhl \
              --only-binary=:all: --python-version 3.12 --implementation cp \
              --platform manylinux_2_34_aarch64 \
              "onnxruntime-gpu==${V}" \
         && unzip -q -j /tmp/ortwhl/onnxruntime_gpu-*.whl \
              "onnxruntime/capi/libonnxruntime.so.${V}" \
              "onnxruntime/capi/libonnxruntime_providers_shared.so" \
              "onnxruntime/capi/libonnxruntime_providers_cuda.so" \
              -d /tmp/ortlib \
         && cp "/tmp/ortlib/libonnxruntime.so.${V}" /out/ort/onnxruntime_arm64.so \
         && cp /tmp/ortlib/libonnxruntime_providers_*.so /out/ort/ \
         && pip install --no-cache-dir --no-deps --target /opt/nvidia \
              --only-binary=:all: --python-version 3.12 --implementation cp \
              --platform manylinux2014_aarch64 --platform manylinux_2_17_aarch64 \
              --platform manylinux_2_27_aarch64 --platform manylinux_2_28_aarch64 \
              "nvidia-cuda-runtime==13.4.92" \
              "nvidia-cublas==13.8.1.7" \
              "nvidia-curand==10.4.4.72" \
              "nvidia-cuda-nvrtc==13.4.92" \
              "nvidia-cudnn-cu13==9.27.0.42" \
         && rm -rf /tmp/ortwhl /tmp/ortlib; \
       fi

########################################
# 2) Runtime
########################################
FROM python:3.12-slim AS runtime
ARG TARGETPLATFORM
ARG TARGETARCH
ARG ORT_FLAVOR=cpu

RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata curl ca-certificates poppler-utils \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system pipelines_group \
    && adduser --system --ingroup pipelines_group --home /home/pipelines pipelines \
    && mkdir -p /home/pipelines \
    && chown pipelines:pipelines_group /home/pipelines

# Go binaries
COPY --from=builder /usr/local/bin/pipelines     /usr/local/bin/pipelines
COPY --from=builder /usr/local/bin/current_date  /usr/local/bin/current_date
COPY --from=builder /usr/local/bin/fem_results   /usr/local/bin/fem_results
COPY --from=builder /usr/local/bin/doc_info      /usr/local/bin/doc_info

# Venv Python
COPY --from=python-builder --chown=pipelines:pipelines_group /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# ── DuckDB extensions ──────────────────────────────────────────────────────────
ENV DUCKDB_VERSION=v1.5.2
ENV DUCKDB_EXT_DIR=/tmp/duckdb/extensions

RUN mkdir -p ${DUCKDB_EXT_DIR} \
    && case "${TARGETARCH}" in \
         amd64) DUCKDB_ARCH="linux_amd64" ;; \
         arm64) DUCKDB_ARCH="linux_arm64" ;; \
         *) echo "Architecture not supported: ${TARGETARCH}" && exit 1 ;; \
       esac \
    && curl -fsSL "https://extensions.duckdb.org/${DUCKDB_VERSION}/${DUCKDB_ARCH}/httpfs.duckdb_extension.gz" \
         -o /tmp/httpfs.duckdb_extension.gz \
    && gunzip /tmp/httpfs.duckdb_extension.gz \
    && mv /tmp/httpfs.duckdb_extension ${DUCKDB_EXT_DIR}/httpfs.duckdb_extension \
    \
    && curl -fsSL "https://extensions.duckdb.org/${DUCKDB_VERSION}/${DUCKDB_ARCH}/postgres_scanner.duckdb_extension.gz" \
         -o /tmp/postgres_scanner.duckdb_extension.gz \
    && gunzip /tmp/postgres_scanner.duckdb_extension.gz \
    && mv /tmp/postgres_scanner.duckdb_extension ${DUCKDB_EXT_DIR}/postgres_scanner.duckdb_extension \
    \
    && chown -R pipelines:pipelines_group ${DUCKDB_EXT_DIR}
# ──────────────────────────────────────────────────────────────────────────────

# This grants write permissions to the /tmp directory for the pipelines user
RUN mkdir -p /tmp/duckdb && chown pipelines:pipelines_group /tmp/duckdb
ENV HOME=/tmp/duckdb

WORKDIR /pipelines

# ONNX Runtime library, at the path the Go code loads (amd64: onnxruntime.so,
# arm64: onnxruntime_arm64.so): the GPU build (with its provider libraries
# next to it) when ORT_FLAVOR=gpu, otherwise the CPU one from assets/.
# Both sources are bind-mounted, not copied into the image: a COPY to /tmp
# followed by "rm" in a later step leaves the files in the COPY's layer,
# and the CPU library overwritten by the GPU one would stay in its layer
# too (several hundred MB of the -gpu image stored twice).
COPY --from=gpu-libs /opt/nvidia/ /opt/nvidia/
RUN --mount=type=bind,source=assets,target=/tmp/assets \
    --mount=type=bind,from=gpu-libs,source=/out/ort,target=/tmp/ort \
    case "$TARGETARCH" in \
      amd64) d=./assets/onnx_runtime_linux_amd64; f=onnxruntime.so ;; \
      arm64) d=./assets/onnx_runtime_linux_arm64; f=onnxruntime_arm64.so ;; \
      *) echo "Architecture not supported: $TARGETARCH" && exit 1 ;; \
    esac \
    && mkdir -p "$d" \
    && if ls /tmp/ort/*.so >/dev/null 2>&1; then \
         cp /tmp/ort/*.so "$d"/; \
       else \
         cp "/tmp/assets/onnx_runtime_linux_${TARGETARCH}/$f" "$d"/; \
       fi \
    && chmod 755 "$d"/*.so
# amd64 (CUDA 12 wheels): one folder per library. arm64 (CUDA 13 wheels):
# nvidia/cu13/lib. cuDNN: nvidia/cudnn/lib on both. Folders that do not
# exist are ignored by the loader.
ENV LD_LIBRARY_PATH="/opt/nvidia/nvidia/cu13/lib:/opt/nvidia/nvidia/cuda_runtime/lib:/opt/nvidia/nvidia/cublas/lib:/opt/nvidia/nvidia/cufft/lib:/opt/nvidia/nvidia/curand/lib:/opt/nvidia/nvidia/cudnn/lib"
# Read by the NVIDIA container runtime (only on GPU nodes, ignored elsewhere).
ENV NVIDIA_DRIVER_CAPABILITIES="compute,utility"

# Embedding model of the knowledge bases (RAG): multilingual-e5-small,
# int8 quantized ONNX (118 MB, for CPU), with its tokenizer. The GPU
# image also has the float32 model (470 MB), for the groups whose
# embeddings run on CUDA: the quantized operators have no CUDA kernels.
# config: rag.modelDir.
ARG E5_MODEL_REPO=https://huggingface.co/Xenova/multilingual-e5-small/resolve/main
RUN mkdir -p ./assets/embeddings/multilingual-e5-small \
    && curl -fsSL "${E5_MODEL_REPO}/onnx/model_quantized.onnx" \
         -o ./assets/embeddings/multilingual-e5-small/model_quantized.onnx \
    && curl -fsSL "${E5_MODEL_REPO}/tokenizer.json" \
         -o ./assets/embeddings/multilingual-e5-small/tokenizer.json \
    && if [ "$ORT_FLAVOR" = "gpu" ]; then \
         curl -fsSL "${E5_MODEL_REPO}/onnx/model.onnx" \
           -o ./assets/embeddings/multilingual-e5-small/model.onnx; \
       fi

# Only /pipelines and its data folder belong to the pipelines user: the
# assets (libraries and models, more than 1 GB in the -gpu image) are only
# read. A "chown -R /pipelines" would store all of them again in its layer.
RUN mkdir -p data && chown pipelines:pipelines_group /pipelines /pipelines/data

COPY --chown=pipelines:pipelines_group entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

USER pipelines

EXPOSE 3300
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3300/health || exit 1

ENTRYPOINT ["entrypoint.sh"]