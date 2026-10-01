#!/usr/bin/env bash
#
# Builds the osi4iot CLI for every target platform into ./dist/<os>-<arch>/.
#
# The version lives in ./VERSION (e.g. 0.1.68). main.go embeds that file
# (//go:embed), so every build reads it — this script, `go build` and
# `go install .` alike — and cmd/commands.go never has to be edited.
#
#   ./build.sh              bump the patch number (0.1.68 -> 0.1.69) and build
#   ./build.sh minor        bump the minor number (0.1.68 -> 0.2.0) and build
#   ./build.sh major        bump the major number (0.1.68 -> 1.0.0) and build
#   ./build.sh --no-bump    build the version already in ./VERSION
#   UPX=1 ./build.sh        additionally compress the binaries with upx
#
# Only the binaries are written: everything else in ./dist (the installer
# scripts next to each binary) is versioned in git and left untouched.

set -euo pipefail

cd "$(dirname "$0")"

package_name=osi4iot
platforms=("windows/amd64" "linux/amd64" "linux/arm64")

# ── Version ────────────────────────────────────────────────────────────
version_file=./VERSION
if [ ! -f "$version_file" ]; then
	echo "0.1.0" > "$version_file"
fi
version=$(tr -d '[:space:]' < "$version_file")
if ! [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
	echo "VERSION must be MAJOR.MINOR.PATCH, found '${version}'" >&2
	exit 1
fi
major=${BASH_REMATCH[1]}
minor=${BASH_REMATCH[2]}
patch=${BASH_REMATCH[3]}

case "${1:-patch}" in
	patch) patch=$((patch + 1)) ;;
	minor) minor=$((minor + 1)); patch=0 ;;
	major) major=$((major + 1)); minor=0; patch=0 ;;
	--no-bump) ;;
	*)
		echo "Usage: $0 [patch|minor|major|--no-bump]" >&2
		exit 1
		;;
esac
previous_version=$version
version="${major}.${minor}.${patch}"

# Written BEFORE building: the binaries embed the file at compile time.
# Put back as it was if any platform fails to build, so a failed build
# does not consume a version number.
echo "$version" > "$version_file"
# On every exit path — a failed `go build`, a failed upx, Ctrl-C — unless
# the build reached the end.
build_ok=0
restore_version() {
	if [ "$build_ok" != 1 ]; then
		echo "$previous_version" > "$version_file"
	fi
}
trap restore_version EXIT

# -s -w     drop the symbol table and DWARF debug info: typically 25-35%
#           smaller. Panics still print file:line stack traces.
# -buildid= empty build ID, so the same source always yields the same bytes.
ldflags="-s -w -buildid="

# -trimpath removes this machine's absolute paths from the binary.
buildflags=(-trimpath -ldflags "$ldflags")

# A pure-Go, fully static binary: no C toolchain needed to cross-compile,
# and it runs on any Linux distribution.
export CGO_ENABLED=0

built=()

echo "Building osi4iot CLI ${version}"
for platform in "${platforms[@]}"; do
	GOOS=${platform%/*}
	GOARCH=${platform#*/}
	output_name="./dist/${GOOS}-${GOARCH}/${package_name}"
	if [ "$GOOS" = "windows" ]; then
		output_name+='.exe'
	fi

	echo "  ${GOOS}/${GOARCH}..."
	if ! GOOS=$GOOS GOARCH=$GOARCH go build "${buildflags[@]}" -o "$output_name" .; then
		echo 'An error has occurred! Aborting the script execution...' >&2
		exit 1
	fi

	# Optional executable compression — usually another 50-70% smaller,
	# but Windows antivirus software often flags upx-packed files.
	if [ "${UPX:-0}" = "1" ]; then
		if command -v upx >/dev/null 2>&1; then
			upx --best --lzma -q "$output_name" >/dev/null
		else
			echo "UPX=1 but upx is not installed; skipping compression" >&2
		fi
	fi

	built+=("$output_name")
done

build_ok=1

echo
echo "Sizes:"
du -h "${built[@]}"
echo
echo "Built version ${version} (saved to ${version_file})"