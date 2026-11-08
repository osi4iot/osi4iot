#!/bin/sh
# Leaves in assets/ what the image build would otherwise download from GitHub
# (or compile), in the versions of the Dockerfile:
#   assets/walg_linux_amd64/wal-g + VERSION          release binary (WALG_VERSION)
#   assets/walg_linux_arm64/wal-g + VERSION          compiled with libsodium: from a published image
#   assets/pgvector/pgvector-<version>.tar.gz        source (PGVECTOR_VERSION)
#   assets/pg_textsearch/pg_textsearch-<version>.tar.gz   source (PGTEXTSEARCH_VERSION)
# Usage, from the patroni_admin folder:
#   sh fetch_build_libs.sh                        download what is missing (not wal-g arm64: see --from-image)
#   sh fetch_build_libs.sh --from-image <image>   take wal-g arm64 from a published multi-arch image of
#                                                 patroni_admin built with this WALG_VERSION
#                                                 (e.g. ghcr.io/osi4iot/patroni_admin:latest; needs docker)
#   sh fetch_build_libs.sh <archive>              use an archive downloaded by hand (browser):
#                                                 wal-g-pg-24.04-amd64.tar.gz, or the source of pgvector or
#                                                 pg_textsearch (v0.8.6.tar.gz, pg_textsearch-1.4.0.tar.gz...)
# What is already there in the right version is kept.
set -eu
cd "$(dirname "$0")"

arg() { sed -n "s/^ARG $1=//p" Dockerfile | head -1; }
WV=$(arg WALG_VERSION)
PV=$(arg PGVECTOR_VERSION)
TV=$(arg PGTEXTSEARCH_VERSION)
[ -n "$WV" ] && [ -n "$PV" ] && [ -n "$TV" ] || { echo "WALG_VERSION, PGVECTOR_VERSION or PGTEXTSEARCH_VERSION not found in the Dockerfile"; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

download() { # url file
    echo "download $1"
    curl -fSL --retry 6 --retry-delay 5 --retry-all-errors "$1" -o "$2"
}

walg_ok() { [ -f "assets/walg_linux_$1/wal-g" ] && [ "$(cat "assets/walg_linux_$1/VERSION" 2>/dev/null)" = "$WV" ]; }

walg_amd64() { # [archive]
    d="assets/walg_linux_amd64"
    if [ -z "${1:-}" ] && walg_ok amd64; then echo "ok       $d ($WV)"; return; fi
    f=${1:-$TMP/wal-g.tar.gz}
    [ -n "${1:-}" ] || download "https://github.com/wal-g/wal-g/releases/download/${WV}/wal-g-pg-24.04-amd64.tar.gz" "$f"
    rm -rf "$TMP/w" && mkdir -p "$TMP/w" && tar -xzf "$f" -C "$TMP/w"
    [ -f "$TMP/w/wal-g-pg-24.04-amd64" ] || { echo "$f has no wal-g-pg-24.04-amd64"; exit 1; }
    mkdir -p "$d" && mv "$TMP/w/wal-g-pg-24.04-amd64" "$d/wal-g" && chmod +x "$d/wal-g" && echo "$WV" > "$d/VERSION"
    echo "ready    $d ($WV)"
}

walg_arm64_from_image() { # image
    d="assets/walg_linux_arm64"
    echo "wal-g arm64 from $1 (it must have been built with WALG_VERSION=$WV)"
    docker pull --platform linux/arm64 "$1" >/dev/null
    id=$(docker create --platform linux/arm64 "$1" true)  # never started: only to copy the file
    mkdir -p "$d"
    docker cp "$id:/usr/local/bin/wal-g" "$d/wal-g" || { docker rm "$id" >/dev/null; exit 1; }
    docker rm "$id" >/dev/null
    chmod +x "$d/wal-g" && echo "$WV" > "$d/VERSION"
    echo "ready    $d ($WV)"
}

source_archive() { # name version [archive]
    out="assets/$1/$1-$2.tar.gz"
    if [ -z "${3:-}" ] && [ -s "$out" ]; then echo "ok       $out"; return; fi
    f=${3:-$TMP/$1.tar.gz}
    case "$1" in
        pgvector) repo=pgvector/pgvector ;;
        pg_textsearch) repo=timescale/pg_textsearch ;;
    esac
    [ -n "${3:-}" ] || download "https://github.com/${repo}/archive/refs/tags/$2.tar.gz" "$f"
    top=$(tar -tzf "$f" | head -1 | cut -d/ -f1)
    [ "$top" = "$1-${2#v}" ] || { echo "$f is not the $1 $2 source (it has $top)"; exit 1; }
    mkdir -p "assets/$1" && cp "$f" "$out"
    echo "ready    $out"
}

case "${1:-}" in
    --from-image)
        [ -n "${2:-}" ] || { echo "--from-image needs the image, e.g. ghcr.io/osi4iot/patroni_admin:latest"; exit 1; }
        walg_arm64_from_image "$2" ;;
    *wal-g-pg-24.04-amd64.tar.gz) walg_amd64 "$1" ;;
    *.tar.gz)
        top=$(tar -tzf "$1" | head -1 | cut -d/ -f1)
        case "$top" in
            pgvector-*) source_archive pgvector "$PV" "$1" ;;
            pg_textsearch-*) source_archive pg_textsearch "$TV" "$1" ;;
            *) echo "$1: not a wal-g, pgvector or pg_textsearch archive (it has $top)"; exit 1 ;;
        esac ;;
    "")
        walg_amd64
        source_archive pgvector "$PV"
        source_archive pg_textsearch "$TV"
        if walg_ok arm64; then
            echo "ok       assets/walg_linux_arm64 ($WV)"
        else
            echo "missing  assets/walg_linux_arm64: the build compiles it; to avoid it:"
            echo "         sh fetch_build_libs.sh --from-image ghcr.io/osi4iot/patroni_admin:latest"
        fi ;;
    *) echo "unknown argument: $1 (see the head of this script)"; exit 1 ;;
esac
