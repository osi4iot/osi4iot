package rag

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"

	"github.com/daulet/tokenizers"
	ort "github.com/yalue/onnxruntime_go"

	"pipelines/logger"
	"pipelines/nodes"
)

// The embedding model: multilingual-e5-small (384 dimensions, ~100
// languages). ONNX export with its Hugging Face tokenizer.json, e.g. from
// Xenova/multilingual-e5-small. E5 models expect "query: " in front of
// questions and "passage: " in front of the indexed text.
const (
	EmbeddingDims  = 384
	maxModelTokens = 512
	embedBatchSize = 16
	queryPrefix    = "query: "
	passagePrefix  = "passage: "
)

// modelFiles are tried in order: the int8 quantized model is ~4x smaller
// and faster on CPU, where the embeddings run.
var modelFiles = []string{"model_quantized.onnx", "model.onnx"}

// Embedder computes embeddings on its own OS thread (ORT sessions are
// used from one thread, as in the MlModel nodes). It runs on CPU: the
// model is small, embeddings are computed in bursts (a document being
// indexed, one query), and a quantized model has no CUDA kernels anyway.
type Embedder struct {
	calls chan embedCall
}

type embedCall struct {
	texts []string
	reply chan embedResult
}

type embedResult struct {
	vectors [][]float32
	err     error
}

// NewEmbedder loads the model and the tokenizer from dir.
func NewEmbedder(dir string, log *logger.Logger) (*Embedder, error) {
	var modelPath string
	for _, name := range modelFiles {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			modelPath = p
			break
		}
	}
	if modelPath == "" {
		return nil, fmt.Errorf("no embedding model (%v) in %s", modelFiles, dir)
	}
	tokenizerPath := filepath.Join(dir, "tokenizer.json")

	if err := nodes.InitONNXRuntime(log); err != nil {
		return nil, err
	}

	e := &Embedder{calls: make(chan embedCall)}
	ready := make(chan error, 1)
	go e.run(modelPath, tokenizerPath, log, ready)
	if err := <-ready; err != nil {
		return nil, err
	}
	log.Infof("Knowledge bases: embedding model %s loaded", modelPath)
	return e, nil
}

// EmbedQuery embeds a question.
func (e *Embedder) EmbedQuery(text string) ([]float32, error) {
	v, err := e.embed([]string{queryPrefix + text})
	if err != nil {
		return nil, err
	}
	return v[0], nil
}

// EmbedPassages embeds the chunks of a document.
func (e *Embedder) EmbedPassages(texts []string) ([][]float32, error) {
	in := make([]string, len(texts))
	for i, t := range texts {
		in[i] = passagePrefix + t
	}
	return e.embed(in)
}

func (e *Embedder) embed(texts []string) ([][]float32, error) {
	reply := make(chan embedResult, 1)
	e.calls <- embedCall{texts: texts, reply: reply}
	r := <-reply
	return r.vectors, r.err
}

// run owns the tokenizer and the ORT session, on a locked OS thread.
func (e *Embedder) run(modelPath, tokenizerPath string, log *logger.Logger, ready chan<- error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	tk, err := tokenizers.FromFile(tokenizerPath)
	if err != nil {
		ready <- fmt.Errorf("error loading %s: %w", tokenizerPath, err)
		return
	}
	defer tk.Close()

	inputs, outputs, err := ort.GetInputOutputInfo(modelPath)
	if err != nil {
		ready <- fmt.Errorf("error reading %s: %w", modelPath, err)
		return
	}
	inputNames := make([]string, len(inputs))
	for i, in := range inputs {
		inputNames[i] = in.Name
	}
	outputName := outputs[0].Name // last_hidden_state

	options, err := ort.NewSessionOptions()
	if err != nil {
		ready <- err
		return
	}
	_ = options.SetIntraOpNumThreads(nodes.IntraOpThreads())
	session, err := ort.NewDynamicAdvancedSession(modelPath, inputNames, []string{outputName}, options)
	options.Destroy()
	if err != nil {
		ready <- fmt.Errorf("error creating the embedding session: %w", err)
		return
	}
	defer session.Destroy()
	ready <- nil

	for call := range e.calls {
		var vectors [][]float32
		var err error
		for start := 0; start < len(call.texts) && err == nil; start += embedBatchSize {
			end := min(start+embedBatchSize, len(call.texts))
			var batch [][]float32
			batch, err = embedBatch(tk, session, inputNames, call.texts[start:end])
			vectors = append(vectors, batch...)
		}
		call.reply <- embedResult{vectors: vectors, err: err}
	}
}

// embedBatch tokenizes, pads to the longest text, runs the model and
// mean-pools the token embeddings over the attention mask, then
// L2-normalizes (cosine distance is then a dot product).
func embedBatch(tk *tokenizers.Tokenizer, session *ort.DynamicAdvancedSession, inputNames []string, texts []string) ([][]float32, error) {
	ids := make([][]uint32, len(texts))
	maxLen := 0
	for i, t := range texts {
		tokenIDs, _ := tk.Encode(t, true)
		if len(tokenIDs) > maxModelTokens {
			// Keep the closing special token (</s>).
			last := tokenIDs[len(tokenIDs)-1]
			tokenIDs = append(tokenIDs[:maxModelTokens-1:maxModelTokens-1], last)
		}
		ids[i] = tokenIDs
		maxLen = max(maxLen, len(tokenIDs))
	}
	if maxLen == 0 {
		return nil, fmt.Errorf("nothing to embed")
	}

	n := len(texts)
	inputIDs := make([]int64, n*maxLen)
	mask := make([]int64, n*maxLen)
	typeIDs := make([]int64, n*maxLen)
	for i, row := range ids {
		for j, id := range row {
			inputIDs[i*maxLen+j] = int64(id)
			mask[i*maxLen+j] = 1
		}
		// Padding: id 1 is <pad> for XLM-R's tokenizer; masked out anyway.
		for j := len(row); j < maxLen; j++ {
			inputIDs[i*maxLen+j] = 1
		}
	}

	shape := ort.NewShape(int64(n), int64(maxLen))
	values := make([]ort.Value, len(inputNames))
	defer func() {
		for _, v := range values {
			if v != nil {
				v.Destroy()
			}
		}
	}()
	for i, name := range inputNames {
		var data []int64
		switch name {
		case "input_ids":
			data = inputIDs
		case "attention_mask":
			data = mask
		case "token_type_ids":
			data = typeIDs
		default:
			return nil, fmt.Errorf("unexpected model input %q", name)
		}
		t, err := ort.NewTensor(shape, data)
		if err != nil {
			return nil, err
		}
		values[i] = t
	}

	outputs := []ort.Value{nil}
	if err := session.Run(values, outputs); err != nil {
		return nil, fmt.Errorf("error running the embedding model: %w", err)
	}
	defer outputs[0].Destroy()
	hidden, ok := outputs[0].(*ort.Tensor[float32])
	if !ok {
		return nil, fmt.Errorf("unexpected embedding output type %T", outputs[0])
	}
	outShape := hidden.GetShape()
	if len(outShape) != 3 || outShape[2] != EmbeddingDims {
		return nil, fmt.Errorf("unexpected embedding output shape %v (want [batch, tokens, %d])", outShape, EmbeddingDims)
	}
	data := hidden.GetData()
	seq := int(outShape[1])

	vectors := make([][]float32, n)
	for i := 0; i < n; i++ {
		v := make([]float32, EmbeddingDims)
		count := float32(0)
		for j := 0; j < seq && j < maxLen; j++ {
			if mask[i*maxLen+j] == 0 {
				continue
			}
			base := (i*seq + j) * EmbeddingDims
			for k := 0; k < EmbeddingDims; k++ {
				v[k] += data[base+k]
			}
			count++
		}
		var norm float64
		for k := range v {
			v[k] /= count
			norm += float64(v[k]) * float64(v[k])
		}
		if norm = math.Sqrt(norm); norm > 0 {
			for k := range v {
				v[k] = float32(float64(v[k]) / norm)
			}
		}
		vectors[i] = v
	}
	return vectors, nil
}
