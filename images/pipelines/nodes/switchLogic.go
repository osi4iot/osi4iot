package nodes

// Switch node logic (pure): rules on one field, one output per rule.

import (
	"fmt"
	"regexp"
	"strings"
)

var switchOperators = map[string]bool{
	"eq": true, "neq": true, "lt": true, "lte": true, "gt": true, "gte": true,
	"between": true, "contains": true, "regex": true,
	"true": true, "false": true, "exists": true, "notExists": true,
	"isNumber": true, "isString": true,
}

type switchRule struct {
	Operator string
	Value    string
	Value2   string
	re       *regexp.Regexp
}

type switchConfig struct {
	Property  string
	Rules     []switchRule
	CheckAll  bool // all the rules that match, or stop at the first one
	Otherwise bool // one more output for the messages no rule matched
}

// numOutputs is the number of outputs the node must have.
func (c *switchConfig) numOutputs() int {
	if c.Otherwise {
		return len(c.Rules) + 1
	}
	return len(c.Rules)
}

func parseSwitchConfig(settings map[string]any) (*switchConfig, error) {
	cfg := &switchConfig{
		Property:  settingString(settings, "property", "payload"),
		CheckAll:  settingString(settings, "checkMode", "first") == "all",
		Otherwise: settingBool(settings, "otherwise", false),
	}
	for i, raw := range settingMaps(settings, "rules") {
		rule := switchRule{
			Operator: settingString(raw, "operator", ""),
			Value:    valueText(raw["value"]),
			Value2:   valueText(raw["value2"]),
		}
		if !switchOperators[rule.Operator] {
			return nil, fmt.Errorf("rule %d: unknown operator %q", i+1, rule.Operator)
		}
		switch rule.Operator {
		case "regex":
			re, err := regexp.Compile(rule.Value)
			if err != nil {
				return nil, fmt.Errorf("rule %d: invalid regular expression: %v", i+1, err)
			}
			rule.re = re
		case "lt", "lte", "gt", "gte":
			if _, ok := toNumber(rule.Value); !ok {
				return nil, fmt.Errorf("rule %d: %q is not a number", i+1, rule.Value)
			}
		case "between":
			_, ok1 := toNumber(rule.Value)
			_, ok2 := toNumber(rule.Value2)
			if !ok1 || !ok2 {
				return nil, fmt.Errorf("rule %d: between needs two numbers", i+1)
			}
		}
		cfg.Rules = append(cfg.Rules, rule)
	}
	if len(cfg.Rules) == 0 {
		return nil, fmt.Errorf("at least one rule is required")
	}
	return cfg, nil
}

// matches says whether a rule holds for a value (exists: whether the
// message has the field).
func (r *switchRule) matches(value any, exists bool) bool {
	switch r.Operator {
	case "exists":
		return exists && value != nil
	case "notExists":
		return !exists || value == nil
	}
	if !exists {
		return false
	}
	switch r.Operator {
	case "eq", "neq":
		equal := false
		a, okA := toNumber(value)
		b, okB := toNumber(r.Value)
		if okA && okB {
			equal = a == b
		} else {
			equal = valueText(value) == r.Value
		}
		return equal == (r.Operator == "eq")
	case "lt", "lte", "gt", "gte":
		a, ok := toNumber(value)
		if !ok {
			return false
		}
		b, _ := toNumber(r.Value)
		switch r.Operator {
		case "lt":
			return a < b
		case "lte":
			return a <= b
		case "gt":
			return a > b
		default:
			return a >= b
		}
	case "between":
		a, ok := toNumber(value)
		if !ok {
			return false
		}
		lo, _ := toNumber(r.Value)
		hi, _ := toNumber(r.Value2)
		if lo > hi {
			lo, hi = hi, lo
		}
		return a >= lo && a <= hi
	case "contains":
		if list, ok := value.([]any); ok {
			for _, item := range list {
				if valueText(item) == r.Value {
					return true
				}
			}
			return false
		}
		return strings.Contains(valueText(value), r.Value)
	case "regex":
		return r.re != nil && r.re.MatchString(valueText(value))
	case "true":
		b, ok := value.(bool)
		return ok && b
	case "false":
		b, ok := value.(bool)
		return ok && !b
	case "isNumber":
		_, ok := value.(float64)
		if !ok {
			_, ok = toNumber(value)
			_, isText := value.(string)
			ok = ok && !isText
		}
		return ok
	case "isString":
		_, ok := value.(string)
		return ok
	}
	return false
}

// outputs are the outputs a message goes to.
func (c *switchConfig) outputs(value any, exists bool) []int {
	out := []int{}
	for i := range c.Rules {
		if c.Rules[i].matches(value, exists) {
			out = append(out, i)
			if !c.CheckAll {
				break
			}
		}
	}
	if len(out) == 0 && c.Otherwise {
		out = append(out, len(c.Rules))
	}
	return out
}
