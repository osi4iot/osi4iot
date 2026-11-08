# WAL-G and the sources of pgvector and pg_textsearch, into assets/ (once, and
# again when their versions change), so the build does not depend on GitHub nor
# compile WAL-G for arm64:
#   sh fetch_build_libs.sh
#   sh fetch_build_libs.sh --from-image ghcr.io/osi4iot/patroni_admin:latest
# --build-arg OFFLINE=1 makes the build fail instead of downloading them.
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/patroni_admin:18.4-alpine3.24 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/osi4iot/patroni_admin:latest --push .
