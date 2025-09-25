package function_library

import (
	"pipelines/common"
	"pipelines/logger"
)

func GetJSFunctions(node common.Node, fm common.Manager, log *logger.Logger) []common.JSFunction {
	return []common.JSFunction{
		{
			Name: "Go",
			Func: func() *Golang {
				return newGolang(node, fm, log)
			},
		},
	}
}

type Golang struct {
	node common.Node
	log  *logger.Logger
	fm   common.Manager
}

func newGolang(node common.Node, fm common.Manager, log *logger.Logger) *Golang {
	return &Golang{
		node: node,
		log:  log,
		fm:   fm,
	}
}

func (g *Golang) Logger() *NodeLogger {
	return newLogger(g.node)
}

func (g *Golang) Time() *Time {
	return NewTime(g.node)
}

func (g *Golang) KvStore() *KvStore {
	return NewKvStore(g.node, g.fm, g.log)
}

func (g *Golang) Http() *Http {
	return NewHttp(g.node, g.log)
}

func (g *Golang) Image() *Image {
	return NewImage(g.node)
}

func (g *Golang) Utils() *Utils {
	return NewUtils(g.node, g.fm)
}

func (g *Golang) All() map[string]interface{} {
	utils := NewUtils(g.node, g.fm)
	log := newLogger(g.node)
	time := NewTime(g.node)
	kvStore := NewKvStore(g.node, g.fm, g.log)
	image := NewImage(g.node)
	http := NewHttp(g.node, g.log)
	dsp := NewDsp(g.node, g.log)
	yolo := NewYolo(g.node, g.log)
	instanceMap := map[string]interface{}{
		"log":     log,
		"utils":   utils,
		"time":    time,
		"kvStore": kvStore,
		"image":   image,
		"http":    http,
		"dsp":     dsp,
		"yolo":    yolo,
	}
	return instanceMap
}
