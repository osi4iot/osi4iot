#!/bin/sh
# Leaves in assets/ what the image build would otherwise download from GitHub,
# in the versions of the Dockerfile:
#   assets/walg_linux_amd64/wal-g + VERSION      (WALG_VERSION)
#   assets/walg_linux_arm64/wal-g + VERSION
#   assets/pgvector/pgvector-<version>.tar.gz    (PGVECTOR_VERSION, source)
# Usage, from the patroni_metrics folder:
#   sh fetch_build_libs.sh               download what is missing
#   sh fetch_build_libs.sh <archive>     use an archive downloaded by hand (browser):
#                                        wal-g-pg-24.04-amd64.tar.gz, wal-g-pg-24.04-aarch64.tar.gz,
#                                        or the pgvector source (v0.8.6.tar.gz / pgvector-0.8.6.tar.gz)
# What is already there in the right version is kept.
set -eu
cd "$(dirname "$0")"

arg() { sed -n "s/^ARG $1=//p" Dockerfile | head -1; }
WV=$(arg WALG_VERSION)
PV=$(arg PGVECTOR_VERSION)
[ -n "$WV" ] && [ -n "$PV" ] || { echo "WALG_VERSION or PGVECTOR_VERSION not found in the Dockerfile"; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

download() { # url file
    echo "download $1"
    curl -fSL --retry 6 --retry-delay 5 --retry-all-errors "$1" -o "$2"
}

walg() { # arch (amd64|arm64) [archive]
    d="assets/walg_linux_$1"
    case "$1" in amd64) a=amd64 ;; arm64) a=aarch64 ;; esac
    if [ -z "${2:-}" ] && [ -f "$d/wal-g" ] && [ "$(cat "$d/VERSION" 2>/dev/null)" = "$WV" ]; then
        echo "ok       $d ($WV)"; return
    fi
    f=${2:-$TMP/wal-g-$a.tar.gz}
    [ -n "${2:-}" ] || download "https://github.com/wal-g/wal-g/releases/download/${WV}/wal-g-pg-24.04-${a}.tar.gz" "$f"
    rm -rf "$TMP/w" && mkdir -p "$TMP/w" && tar -xzf "$f" -C "$TMP/w"
    [ -f "$TMP/w/wal-g-pg-24.04-$a" ] || { echo "$f has no wal-g-pg-24.04-$a"; exit 1; }
    mkdir -p "$d" && mv "$TMP/w/wal-g-pg-24.04-$a" "$d/wal-g" && chmod +x "$d/wal-g" && echo "$WV" > "$d/VERSION"
    echo "ready    $d ($WV)"
}

pgvector() { # [archive]
    out="assets/pgvector/pgvector-${PV}.tar.gz"
    if [ -z "${1:-}" ] && [ -s "$out" ]; then echo "ok       $out"; return; fi
    f=${1:-$TMP/pgvector.tar.gz}
    [ -n "${1:-}" ] || download "https://github.com/pgvector/pgvector/archive/refs/tags/${PV}.tar.gz" "$f"
    top=$(tar -tzf "$f" | head -1 | cut -d/ -f1)
    [ "$top" = "pgvector-${PV#v}" ] || { echo "$f is not the pgvector ${PV} source (it has $top)"; exit 1; }
    mkdir -p assets/pgvector && cp "$f" "$out"
    echo "ready    $out"
}

case "${1:-}" in
    *wal-g-pg-24.04-amd64.tar.gz) walg amd64 "$1" ;;
    *wal-g-pg-24.04-aarch64.tar.gz) walg arm64 "$1" ;;
    *.tar.gz) pgvector "$1" ;;
    "")
        walg amd64
        walg arm64
        pgvector ;;
    *) echo "unknown argument: $1 (see the head of this script)"; exit 1 ;;
esac
