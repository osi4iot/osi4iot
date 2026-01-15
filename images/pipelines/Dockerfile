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

# Crear venv e instalar el paquete (no editable -> queda embebido en el venv)
RUN uv venv /opt/venv \
 && . /opt/venv/bin/activate \
 && uv pip install ./mcp_calculate_server

########################################
# 1) Go builder: compila binarios (enlace estático)
########################################
FROM golang:1.25.1-bookworm AS builder

WORKDIR /src

COPY go.mod go.sum ./
COPY main.go ./
COPY admin/ ./admin/
COPY common/ ./common/
COPY config/ ./config/
COPY flows_manager/ ./flows_manager/
COPY function_library/ ./function_library/
COPY logger/ ./logger/
COPY nats/ ./nats/
COPY nodes/ ./nodes/
COPY utils/ ./utils/
RUN go mod download && go mod verify

# pipelines
RUN CGO_ENABLED=1 CC=gcc go build -ldflags="-s -w" -o /usr/local/bin/pipelines .

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
# 2) Runtime (mínimo)
########################################
FROM python:3.12-slim AS runtime
ARG TARGETPLATFORM
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
      tzdata curl ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system pipelines_group \
  && adduser --system --ingroup pipelines_group pipelines

# Binarios Go
COPY --from=builder /usr/local/bin/pipelines     /usr/local/bin/pipelines
COPY --from=builder /usr/local/bin/current_date  /usr/local/bin/current_date
COPY --from=builder /usr/local/bin/fem_results   /usr/local/bin/fem_results

# Venv Python
COPY --from=python-builder --chown=pipelines:pipelines_group /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"


WORKDIR /pipelines

RUN mkdir -p ./assets
COPY assets/ /tmp/assets/
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        mkdir -p ./assets/onnx_runtime_linux_amd64 && \
        cp /tmp/assets/onnx_runtime_linux_amd64/onnxruntime.so ./assets/onnx_runtime_linux_amd64/ && \
        chmod 755 ./assets/onnx_runtime_linux_amd64/onnxruntime.so; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        mkdir -p ./assets/onnx_runtime_linux_arm64 && \
        cp /tmp/assets/onnx_runtime_linux_arm64/onnxruntime_arm64.so ./assets/onnx_runtime_linux_arm64/ && \
        chmod 755 ./assets/onnx_runtime_linux_arm64/onnxruntime_arm64.so; \
    else \
        echo "Architecture not supported: $TARGETARCH" && exit 1; \
    fi && \
    rm -rf /tmp/assets

RUN mkdir data && chown -R pipelines:pipelines_group /pipelines
USER pipelines

EXPOSE 3300
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3300/health || exit 1

ENTRYPOINT ["pipelines"]