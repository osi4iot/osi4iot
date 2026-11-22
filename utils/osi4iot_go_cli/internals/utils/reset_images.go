package utils

import (
	"sort"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// ImageChange is one SERVICES_DATA entry whose image differs from the
// packaged default.
type ImageChange struct {
	Service string
	Current string
	Default string
}

// DefaultImagesPlan is what `osi4iot state reset_images` would do to
// SERVICES_DATA.
type DefaultImagesPlan struct {
	// Changes are the entries whose image is not the default, sorted
	// by service name.
	Changes []ImageChange
	// Unchanged are the entries that already have the default image.
	Unchanged []string
	// NoDefault are the entries GetDefaultServicesDataMap has no image
	// for: left as they are.
	NoDefault []string
	// Unknown are the names asked for with --service that have no
	// SERVICES_DATA entry.
	Unknown []string
	// Selected are the entries that have a default image, changed or
	// not: the ones --apply brings the running services in line with.
	Selected []string
}

// PlanDefaultImages compares SERVICES_DATA with the default images.
// only restricts the comparison to those service names; empty means
// every entry. Pure: it changes nothing.
func PlanDefaultImages(
	servicesData []osi_types.ServiceData,
	defaults map[string]osi_types.ServiceData,
	only []string,
) DefaultImagesPlan {
	plan := DefaultImagesPlan{}

	wanted := map[string]bool{}
	for _, name := range only {
		wanted[name] = true
	}
	inState := map[string]bool{}

	for _, svc := range servicesData {
		inState[svc.ServiceName] = true
		if len(wanted) > 0 && !wanted[svc.ServiceName] {
			continue
		}
		def, ok := defaults[svc.ServiceName]
		if !ok || def.Image == "" {
			plan.NoDefault = append(plan.NoDefault, svc.ServiceName)
			continue
		}
		plan.Selected = append(plan.Selected, svc.ServiceName)
		if svc.Image == def.Image {
			plan.Unchanged = append(plan.Unchanged, svc.ServiceName)
			continue
		}
		plan.Changes = append(plan.Changes, ImageChange{
			Service: svc.ServiceName,
			Current: svc.Image,
			Default: def.Image,
		})
	}

	for _, name := range only {
		if !inState[name] {
			plan.Unknown = append(plan.Unknown, name)
		}
	}

	sort.Slice(plan.Changes, func(i, j int) bool { return plan.Changes[i].Service < plan.Changes[j].Service })
	sort.Strings(plan.Unchanged)
	sort.Strings(plan.NoDefault)
	sort.Strings(plan.Unknown)
	sort.Strings(plan.Selected)
	return plan
}

// ApplyDefaultImages writes the plan's default images into
// SERVICES_DATA. Only Image changes; Replicas, Cpu and Memory are kept.
// Returns how many entries changed.
func ApplyDefaultImages(pd *osi_types.PlatformData, plan DefaultImagesPlan) int {
	defaults := map[string]string{}
	for _, c := range plan.Changes {
		defaults[c.Service] = c.Default
	}
	changed := 0
	for i, svc := range pd.PlatformInfo.ServicesData {
		if image, ok := defaults[svc.ServiceName]; ok && svc.Image != image {
			pd.PlatformInfo.ServicesData[i].Image = image
			changed++
		}
	}
	return changed
}
