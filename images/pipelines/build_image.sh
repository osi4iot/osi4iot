VERSION=1.3.0

# CPU image (as before)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/osi4iot/pipelines:${VERSION} \
  -t ghcr.io/osi4iot/pipelines:latest \
  --push .

# GPU image, both architectures:
#   amd64: ONNX Runtime 1.25.1 + CUDA 12.8 (NVIDIA driver >= 570)
#   arm64: ONNX Runtime 1.31.0 + CUDA 13   (NVIDIA driver >= 580), e.g. AWS g5g
# On nodes without GPU it runs the models on CPU.
docker buildx build --platform linux/amd64,linux/arm64 \
  --build-arg ORT_FLAVOR=gpu \
  -t ghcr.io/osi4iot/pipelines:${VERSION}-gpu \
  -t ghcr.io/osi4iot/pipelines:latest-gpu \
  --push .

