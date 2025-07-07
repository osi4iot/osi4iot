package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetOrgs() []*common.Org {
	var orgs []*common.Org
	fm.Orgs.Range(func(key, value interface{}) bool {
		orgs = append(orgs, value.(*common.Org))
		return true
	})
	return orgs
}

func (fm *FlowsManager) GetOrg(orgId int) *common.Org{
	orgIdStr :=  strconv.Itoa(orgId)
	if org, ok := fm.Orgs.Load(orgIdStr); ok {
		return org.(*common.Org)
	}
	return nil
}

func (fm *FlowsManager) AddOrg(org *common.Org) {
	orgIdStr := strconv.Itoa(org.Id)
	if _, ok := fm.Orgs.Load(orgIdStr); !ok {
		fm.Orgs.Store(orgIdStr, org)
	} else {
		fm.log.Error("Org with ID %d already exists", org.Id)
	}
}

func (fm *FlowsManager) AddOrgs(orgs []*common.Org) {
	for _, org := range orgs {
		orgIdStr := strconv.Itoa(org.Id)
		if _, ok := fm.Orgs.Load(orgIdStr); !ok {
			fm.Orgs.Store(orgIdStr, org)
		} else {
			fm.log.Error("Org with ID %d already exists", org.Id)
		}
	}
}

func (fm *FlowsManager) DeleteOrg(orgId int) error {
	orgIdStr := strconv.Itoa(orgId)
	if _, ok := fm.Orgs.Load(orgIdStr); ok {
		fm.Orgs.Delete(orgIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateOrg(org *common.Org) error {
	orgIdStr := strconv.Itoa(org.Id)
	if _, ok := fm.Orgs.Load(orgIdStr); ok {
		fm.Orgs.Store(orgIdStr, org)
		return nil
	}
	return common.ErrNotFound
}