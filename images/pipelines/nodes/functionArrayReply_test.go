package nodes

import (
	"testing"
	"time"

	"github.com/dop251/goja"

	"pipelines/common"
	"pipelines/message"
)

// A Function with several outputs that returns the message it received in one
// of them (an AiTool call answered by Publish Reply, and something else on
// another output) keeps its reply context, as with a single output.
func TestFunctionArrayKeepsReplyContext(t *testing.T) {
	n := &FuncNode{}
	vm := goja.New()
	in := message.NewMessage("tool", map[string]any{"action": "view"}, nil, "", nil)
	in.SetReplyContext(&common.ReplyContext{Subject: "_INBOX.abc", ExpiresAt: time.Now().Add(time.Minute)})
	_ = vm.Set("msg", n.convertMessageToJS(vm, in))
	res, err := vm.RunString(`msg.payload = {ok: true}; [msg, {payload: {camera: {view: "top"}}}]`)
	if err != nil {
		t.Fatal(err)
	}
	out, err := n.convertFromJSToMessage(res)
	if err != nil {
		t.Fatal(err)
	}
	msgs, ok := out.([]common.Message)
	if !ok || len(msgs) != 2 {
		t.Fatalf("%T %v", out, out)
	}
	if !msgs[0].IsRequest() || msgs[0].GetReplyContext().Subject != "_INBOX.abc" || msgs[0].GetPayload()["ok"] != true {
		t.Fatalf("reply lost: %+v", msgs[0])
	}
	if msgs[1].IsRequest() || msgs[1].GetPayload()["camera"] == nil {
		t.Fatalf("second output %+v", msgs[1])
	}
}
