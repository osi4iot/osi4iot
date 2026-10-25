package flows_manager

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/rag"
)

// Knowledge bases of the groups (RAG): see package rag. This file wires
// them to the admin API's messages and to the AI agents.
//
// Only the groups whose knowledge base is enabled (organization AND
// group, common.RagAllowed) are indexed and searched; disabling it removes
// the group's index (its documents stay in the bucket, and are indexed
// again when it is enabled).
//
// Every replica receives the knowledgeFile messages; the document's lock
// in the leader KV store makes one of them do the indexing. The documents
// of a group allowed the GPU are indexed by a GPU replica, on CUDA, when
// one is alive.

// groupRagAllowed applies the knowledge bases' policy to a group.
func (fm *FlowsManager) groupRagAllowed(groupID int) bool {
	group := fm.GetGroup(groupID)
	if group == nil {
		return false
	}
	return common.RagAllowed(fm.GetOrg(group.OrgId), group)
}

func (fm *FlowsManager) groupIDs() []int {
	groups := fm.GetGroups()
	ids := make([]int, 0, len(groups))
	for _, g := range groups {
		ids = append(ids, g.Id)
	}
	return ids
}

func (fm *FlowsManager) groupIDsInOrg(orgID int) []int {
	var ids []int
	for _, g := range fm.GetGroups() {
		if g.OrgId == orgID {
			ids = append(ids, g.Id)
		}
	}
	return ids
}

// applyRagPolicyChange follows an organization's or group's knowledge
// base being enabled or disabled: every replica loads the embedding model
// if it now needs it; replica 1 indexes the documents of the groups
// enabled and removes the index of the groups disabled.
func (fm *FlowsManager) applyRagPolicyChange(ctx context.Context, groupIDs []int) {
	if fm.Knowledge == nil || len(groupIDs) == 0 {
		return
	}
	fm.Knowledge.Preload(groupIDs)
	if fm.ReplicaIndex != 1 {
		return
	}
	go func() {
		ctx := context.WithoutCancel(ctx)
		for _, id := range groupIDs {
			group := fm.GetGroup(id)
			if group == nil {
				continue
			}
			if fm.groupRagAllowed(id) {
				fm.log.Infof("Knowledge base of group %d enabled: indexing its documents", id)
				lock := func(key string) (func(), bool) { return fm.lockKnowledgeDocument(ctx, key) }
				if err := fm.Knowledge.ReconcileGroup(ctx, group.OrgId, id, lock); err != nil {
					fm.log.Errorf("Knowledge base of group %d: %v", id, err)
				}
			} else {
				fm.log.Infof("Knowledge base of group %d disabled: removing its index", id)
				if err := fm.Knowledge.DeleteGroup(ctx, id); err != nil {
					fm.log.Errorf("Knowledge base of group %d: %v", id, err)
				}
			}
		}
	}()
}

// knowledgeFileMessage handles admin_api's knowledgeFile create/delete:
// a document uploaded to, or deleted from, a group's knowledge base.
func (fm *FlowsManager) knowledgeFileMessage(ctx context.Context, action string, groupID int, fileName string) {
	if fm.Knowledge == nil || fileName == "" {
		return
	}
	group := fm.GetGroup(groupID)
	if group == nil {
		fm.log.Errorf("Knowledge base: group %d not found", groupID)
		return
	}
	key := rag.KnowledgePrefix(group.OrgId, groupID) + fileName

	// Not indexed while the group's knowledge base is disabled (admin_api
	// refuses the uploads then; a delete is always applied).
	if action == "create" && !fm.groupRagAllowed(groupID) {
		return
	}

	// A group allowed the GPU: left to the GPU replicas when there is one.
	if action == "create" && !fm.GpuCapable && fm.groupGpuAllowed(groupID) && len(fm.aliveGpuReplicas(ctx)) > 0 {
		return
	}

	// Indexing a large PDF takes a while: not in the admin message loop.
	go func() {
		ctx := context.WithoutCancel(ctx)
		release, ok := fm.lockKnowledgeDocument(ctx, key)
		if !ok {
			return // another replica has it
		}
		defer release()
		switch action {
		case "create":
			if _, err := fm.Knowledge.IndexDocument(ctx, group.OrgId, groupID, fileName); err != nil {
				fm.log.Errorf("Knowledge base of group %d: %s: %v", groupID, fileName, err)
			}
		case "delete":
			if err := fm.Knowledge.DeleteDocument(ctx, group.OrgId, groupID, fileName); err != nil {
				fm.log.Errorf("Knowledge base of group %d: removing %s: %v", groupID, fileName, err)
			}
		}
	}()
}

// deleteKnowledgeBase removes a deleted group's knowledge base.
func (fm *FlowsManager) deleteKnowledgeBase(ctx context.Context, groupID int) {
	if fm.Knowledge == nil {
		return
	}
	if err := fm.Knowledge.DeleteGroup(ctx, groupID); err != nil {
		fm.log.Errorf("Knowledge base of group %d: %v", groupID, err)
	}
}

// reconcileKnowledgeBases runs at startup on replica 1, in the
// background: for the groups whose knowledge base is enabled, it indexes
// what is in the bucket and not in the database (documents uploaded while
// pipelines was down, or before this version) and removes what is gone;
// it removes the index of the other groups. It waits for the database: the role and
// schema may be created by the CLI after pipelines started.
func (fm *FlowsManager) reconcileKnowledgeBases(ctx context.Context) {
	if fm.Knowledge == nil || fm.ReplicaIndex != 1 {
		return
	}
	go func() {
		for wait := 10 * time.Second; ; wait = min(wait*2, 5*time.Minute) {
			err := fm.Knowledge.Ready(ctx)
			if err == nil {
				break
			}
			fm.log.Warnf("%v; retrying in %v", err, wait)
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
		}

		groups := fm.GetGroups()
		ids := make([]int, 0, len(groups))
		for _, g := range groups {
			if !fm.groupRagAllowed(g.Id) {
				continue
			}
			ids = append(ids, g.Id)
			lock := func(key string) (func(), bool) { return fm.lockKnowledgeDocument(ctx, key) }
			if err := fm.Knowledge.ReconcileGroup(ctx, g.OrgId, g.Id, lock); err != nil {
				fm.log.Errorf("Knowledge base of group %d: %v", g.Id, err)
			}
		}
		if err := fm.Knowledge.DeleteGroupsNotIn(ctx, ids); err != nil {
			fm.log.Errorf("Knowledge bases: %v", err)
		}
	}()
}

// lockKnowledgeDocument takes a document's indexing lock in the leader KV
// store; ok is false when another replica holds it.
func (fm *FlowsManager) lockKnowledgeDocument(ctx context.Context, s3Key string) (release func(), ok bool) {
	kv := fm.GetLeaderKvStore()
	if kv == nil {
		return func() {}, true
	}
	sum := sha1.Sum([]byte(s3Key))
	key := "knowledge_" + hex.EncodeToString(sum[:10])
	if _, err := kv.Create(ctx, key, []byte(strconv.Itoa(fm.ReplicaIndex))); err != nil {
		return nil, false
	}
	return func() { _ = kv.Delete(context.Background(), key) }, true
}

// KnowledgeS3Prefix is the bucket folder of a group's knowledge base,
// where admin_api stores its documents; the agents' doc_info server
// lists and reads them there.
func (fm *FlowsManager) KnowledgeS3Prefix(orgId, groupId int) string {
	return rag.KnowledgePrefix(orgId, groupId)
}

// KnowledgeAccess returns what a digital twin's doc_info server needs to
// list and search the documents the digital twin may read: the endpoint
// and the digital twin's token. ok is false when the knowledge bases are
// off or the group's is not enabled.
func (fm *FlowsManager) KnowledgeAccess(groupID, digitalTwinID int) (url string, token string, ok bool) {
	if fm.Knowledge == nil || !fm.Knowledge.Enabled(groupID) {
		return "", "", false
	}
	return fm.Knowledge.BaseURL(), fm.Knowledge.DigitalTwinToken(groupID, digitalTwinID), true
}

// KnowledgeDocumentsVersion identifies the set of documents a digital
// twin may read (their file names; the titles are read when listed): an
// AI agent restarts its tools when it changes. "" when it may read none
// (or the group's knowledge base is not enabled).
func (fm *FlowsManager) KnowledgeDocumentsVersion(ctx context.Context, groupID, digitalTwinID int) (string, error) {
	if fm.Knowledge == nil {
		return "", nil
	}
	docs, err := fm.Knowledge.DigitalTwinDocuments(ctx, groupID, digitalTwinID)
	if err != nil || len(docs) == 0 {
		return "", err
	}
	names := make([]string, len(docs))
	for i, d := range docs {
		names[i] = d.FileName
	}
	sum := sha1.Sum([]byte(strings.Join(names, "\x00")))
	return hex.EncodeToString(sum[:]), nil
}
