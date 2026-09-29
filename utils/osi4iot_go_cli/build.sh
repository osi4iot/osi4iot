#!/usr/bin/env bash
#
# Builds the osi4iot CLI for every target platform into ./dist/<os>-<arch>/.
#
#   ./build.sh          smaller, stripped binaries
#   UPX=1 ./build.sh    additionally compress them with upx (see below)

set -euo pipefail

package_name=osi4iot
platforms=("windows/amd64" "linux/amd64" "linux/arm64")

# -s -w     drop the symbol table and DWARF debug info: typically 25-35%
#           smaller. Panics still print file:line stack traces; only
#           debuggers (dlv, gdb) lose the information.
# -buildid= empty build ID, so the same source always yields the same
#           bytes (reproducible builds, stable checksums).
ldflags="-s -w -buildid="

# -trimpath removes this machine's absolute paths from the binary: a bit
#           smaller, reproducible, and no home directory leaked in stack
#           traces.
buildflags=(-trimpath -ldflags "$ldflags")

# CGO_ENABLED=0: a pure-Go, fully static binary. No C toolchain needed for
# cross-compiling, and it runs on any Linux distribution (Alpine, old
# glibc…) without depending on the host's libc.
export CGO_ENABLED=0

rm -rf ./dist

for platform in "${platforms[@]}"; do
	GOOS=${platform%/*}
	GOARCH=${platform#*/}
	output_name="./dist/${GOOS}-${GOARCH}/${package_name}"
	if [ "$GOOS" = "windows" ]; then
		output_name+='.exe'
	fi

	echo "Building ${GOOS}/${GOARCH}..."
	if ! GOOS=$GOOS GOARCH=$GOARCH go build "${buildflags[@]}" -o "$output_name" .; then
		echo 'An error has occurred! Aborting the script execution...' >&2
		exit 1
	fi

	# Optional executable compression — usually another 50-70% smaller.
	# Off by default because it has costs: Windows antivirus software
	# (Defender included) often flags upx-packed .exe files as suspicious,
	# the binary is unpacked into memory on every start (slightly slower,
	# more RAM), and it cannot be used where binaries must be signed or
	# memory-mapped as-is.
	if [ "${UPX:-0}" = "1" ]; then
		if command -v upx >/dev/null 2>&1; then
			upx --best --lzma -q "$output_name" >/dev/null
		else
			echo "UPX=1 but upx is not installed; skipping compression" >&2
		fi
	fi
done

echo
echo "Sizes:"
du -h ./dist/*/* | sort -k2