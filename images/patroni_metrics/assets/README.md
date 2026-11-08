# Libraries for the image build

The build takes these from here instead of downloading them from GitHub:

| Path | Version | 
|---|---|
| `walg_linux_amd64/wal-g`, `walg_linux_arm64/wal-g` (each with a `VERSION` file) | `WALG_VERSION` in the `Dockerfile` (e.g. `v3.0.8`) |
| `pgvector/pgvector-<version>.tar.gz` (source) | `PGVECTOR_VERSION` in the `Dockerfile` (e.g. `v0.8.6`) |

Fill them once, from the `patroni_metrics` folder: `sh fetch_build_libs.sh` downloads what is missing, or
`sh fetch_build_libs.sh <archive>` uses an archive downloaded by hand. What is missing is downloaded during the
build, as before; `--build-arg OFFLINE=1` makes the build fail instead.
