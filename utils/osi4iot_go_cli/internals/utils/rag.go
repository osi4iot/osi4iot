package utils

import pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"

// RagRole is the patroni_admin role pipelines connects with to the
// groups' knowledge bases (RAG). post_init.sh creates it, owner of the
// rag schema and of nothing else, when the cluster is bootstrapped.
const RagRole = "pipelines_rag"

// ragPasswordLength matches data.GeneratedPasswordLength.
const ragPasswordLength = 20

// RagEnabled reports whether the platform has the knowledge bases: they
// need pgvector and pg_search, which only the Patroni image has.
func RagEnabled(pi pt.PlatformInfo) bool {
	return pi.UsePatroniTool
}

// EnsurePipelinesRagPassword generates the pipelines_rag password of a
// state file written before it existed, so that an `osi4iot init` from
// such a state file hands it to post_init.sh. Returns whether it
// changed; the caller saves the state file before any secret is built
// from it.
func EnsurePipelinesRagPassword(pi *pt.PlatformInfo) bool {
	if !RagEnabled(*pi) || pi.PipelinesRagPassword != "" {
		return false
	}
	pi.PipelinesRagPassword = GeneratePassword(ragPasswordLength)
	return true
}
