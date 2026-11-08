# Libraries for the image build

The build takes these from here instead of downloading them from GitHub (or compiling them):

| Path | Version |
|---|---|
| `walg_linux_amd64/wal-g` + `VERSION` | the release binary of `WALG_VERSION` (`Dockerfile`, e.g. `v3.0.8`) |
| `walg_linux_arm64/wal-g` + `VERSION` | WAL-G with libsodium already compiled: taken from a published image, so the build does not compile it |
| `pgvector/pgvector-<version>.tar.gz` | source of `PGVECTOR_VERSION` |
| `pg_textsearch/pg_textsearch-<version>.tar.gz` | source of `PGTEXTSEARCH_VERSION` |

Fill them once, from the `patroni_admin` folder:

```sh
sh fetch_build_libs.sh                                         # downloads what is missing
sh fetch_build_libs.sh --from-image ghcr.io/osi4iot/patroni_admin:latest   # wal-g arm64 of a published image
sh fetch_build_libs.sh <archive>                               # an archive downloaded by hand
```

What is missing is downloaded (or, wal-g arm64, compiled) during the build, as before; `--build-arg OFFLINE=1`
makes the build fail instead.
