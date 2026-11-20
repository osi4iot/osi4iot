package nodes

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"

	"pipelines/utils"
)

func TestChatTableHandles(t *testing.T) {
	n := &AiAgentNode{tableSecret: []byte("0123456789abcdef0123456789abcdef")}
	text := "[Attachment 1: \"a.csv\" (CSV table)…table \"⟦table:2026-11-19/AbCdEfGh123.csv⟧\": describe-table…]"
	withHandles := n.withTableHandles("ana", text)
	if strings.Contains(withHandles, "⟦table:") || !strings.Contains(withHandles, "tbl_") {
		t.Fatalf("handles: %s", withHandles)
	}
	// the handle of chat_data (mcp_servers/chat_data: Handle), for the same secret and file
	want := "tbl_dXNlcl8wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1NjcvMjAyNi0xMS0xOS9BYkNkRWZHaDEyMy54bHN4.V3CZRAmooOdcZNEXRpQwNg"
	if got := chatTableHandle(n.tableSecret, "user_0123456789abcdef01234567/2026-11-19/AbCdEfGh123.xlsx"); got != want {
		t.Errorf("handle %s, chat_data's %s", got, want)
	}
	if back := n.withTablePlaceholders("ana", withHandles); back != text {
		t.Errorf("back: %s", back)
	}
	// another user's handle, or another secret's, is not turned into a placeholder of this user
	if back := n.withTablePlaceholders("luis", withHandles); back != withHandles {
		t.Errorf("another user: %s", back)
	}
	other := &AiAgentNode{tableSecret: []byte("another secret of 32 bytes......")}
	if back := other.withTablePlaceholders("ana", withHandles); back != withHandles {
		t.Errorf("another secret: %s", back)
	}
	if got := (&AiAgentNode{}).withTableHandles("ana", text); strings.Contains(got, "tbl_") || strings.Contains(got, "⟦") {
		t.Errorf("without chat_data: %s", got)
	}
}

func TestTableBlock(t *testing.T) {
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	f, _ := w.Create("xl/workbook.xml")
	f.Write([]byte(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Ventas" sheetId="1"/><sheet name="Oculta" state="veryHidden"/><sheet name="Resumen"/></sheets></workbook>`))
	w.Close()
	if got := xlsxSheetNames(b.Bytes()); strings.Join(got, ",") != "Ventas,Resumen" {
		t.Errorf("sheets %v", got)
	}
	n := &AiAgentNode{tableSecret: []byte("0123456789abcdef0123456789abcdef")}
	block := n.tableBlock(2, utils.ChatAttachment{File: "2026-11-19/AbCdEfGh123.csv", Name: "datos.csv"},
		[]byte("nombre;valor\nJos\xe9;1,5\n"), utils.MimeCSV)
	for _, want := range []string{"[Attachment 2: \"datos.csv\" (CSV table)", "⟦table:2026-11-19/AbCdEfGh123.csv⟧", "José;1,5", "[End of attachment 2]"} {
		if !strings.Contains(block, want) {
			t.Errorf("block lacks %q:\n%s", want, block)
		}
	}
	if utils.ChatAttachmentTypeOf([]byte("a;b\n1;2\n"), "x.csv") != utils.MimeCSV ||
		utils.ChatAttachmentTypeOf(b.Bytes(), "x.xlsx") != utils.MimeXLSX ||
		utils.ChatAttachmentTypeOf(b.Bytes(), "x.docx") != "" {
		t.Error("types")
	}
}
