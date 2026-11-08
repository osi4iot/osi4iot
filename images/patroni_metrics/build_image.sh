# WAL-G and the pgvector source, into assets/ (once, and again when WALG_VERSION
# or PGVECTOR_VERSION change), so the build does not depend on GitHub:
#   sh fetch_build_libs.sh
# --build-arg OFFLINE=1 makes the build fail instead of downloading them.
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/patroni_metrics:2.29.1-pg18 --push .

