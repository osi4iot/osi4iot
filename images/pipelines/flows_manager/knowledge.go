package flows_manager

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"strconv"
	"time"

	"pipelines/rag"
)

// Knowledge bases of the groups (RAG): see package rag. This file wires
// them to the admin API's messages and to the AI agents.
//
// Every replica receives the knowledgeFile messages; the document's lock
// in the leader KV store makes one of them do the indexing.

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
// background: it indexes what is in the bucket and not in the database
// (documents uploaded while pipelines was down, or before this version)
// and removes what is gone. It waits for the database: the role and
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

// KnowledgeSearch returns what an AI agent's doc_info server needs to
// search its group's knowledge base: the endpoint and the group's token.
// ok is false when the knowledge bases are off.
func (fm *FlowsManager) KnowledgeSearch(groupID int) (url string, token string, ok bool) {
	if fm.Knowledge == nil {
		return "", "", false
	}
	return fm.Knowledge.SearchURL(), fm.Knowledge.GroupToken(groupID), true
}

