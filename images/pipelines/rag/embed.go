package rag

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"

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

// modelFilesFor lists, in order of preference, the model files for a
// provider. On CPU the int8 quantized model: ~4x smaller and faster. On
// CUDA the float32 one: the quantized operators have no CUDA kernels and
// would run on CPU, copying the tensors back and forth. Either is taken
// when the other is missing (the CPU images have only the quantized one).
func modelFilesFor(provider string) []string {
	if provider == nodes.ProviderCUDA {
		return []string{"model.onnx", "model_quantized.onnx"}
	}
	return []string{"model_quantized.onnx", "model.onnx"}
}

// Embedder computes embeddings on its own OS thread (ORT sessions are
// used from one thread, as in the MlModel nodes), on CPU or CUDA.
//
// Memory: the session has no CPU memory arena. With it, ONNX Runtime
// keeps the peak of the intermediate tensors of the largest batch (16
// chunks of up to 512 tokens: hundreds of MB of attention matrices) for
// the life of the process; without it they are freed after each batch,
// and malloc_trim gives them back to the system after each document.
//
// Once loaded, the model stays loaded for the life of the process: a
// knowledge base's searches must not wait for it (on CUDA, loading takes
// seconds of CPU). What it keeps is the model (about 220 MB of memory on
// CPU with the int8 model) and, on CUDA, its GPU memory.
type Embedder struct {
	calls    chan embedCall
	provider string
}

type embedCall struct {
	texts []string
	reply chan embedResult
}

type embedResult struct {
	vectors [][]float32
	err     error
}

// NewEmbedder loads the model and the tokenizer from dir, for provider
// (nodes.ProviderCPU or nodes.ProviderCUDA).
func NewEmbedder(dir, provider string, log *logger.Logger) (*Embedder, error) {
	start := time.Now()
	var modelPath string
	for _, name := range modelFilesFor(provider) {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			modelPath = p
			break
		}
	}
	if modelPath == "" {
		return nil, fmt.Errorf("no embedding model (%v) in %s", modelFilesFor(provider), dir)
	}
	tokenizerPath := filepath.Join(dir, "tokenizer.json")

	if err := nodes.InitONNXRuntime(log); err != nil {
		return nil, err
	}

	e := &Embedder{
		calls:    make(chan embedCall),
		provider: provider,
	}
	ready := make(chan error, 1)
	go e.run(modelPath, tokenizerPath, ready)
	if err := <-ready; err != nil {
		return nil, err
	}
	log.Infof("Knowledge bases: embedding model %s loaded (%s) in %s", modelPath, provider, time.Since(start).Round(time.Millisecond))
	return e, nil
}

// Provider is where the embeddings run: cpu or cuda.
func (e *Embedder) Provider() string { return e.provider }

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

// run owns the tokenizer and the ORT session, on a locked OS thread, for
// the life of the process.
func (e *Embedder) run(modelPath, tokenizerPath string, ready chan<- error) {
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

	// The provider's options (CUDA with the MlModel nodes' settings),
	// without the CPU memory arena or the memory pattern (see Embedder).
	options, err := nodes.NewSessionOptionsFor(e.provider)
	if err != nil {
		ready <- err
		return
	}
	if err := options.SetCpuMemArena(false); err != nil {
		options.Destroy()
		ready <- fmt.Errorf("error disabling the CPU memory arena: %w", err)
		return
	}
	if err := options.SetMemPattern(false); err != nil {
		options.Destroy()
		ready <- fmt.Errorf("error disabling the memory pattern: %w", err)
		return
	}
	// ORT's threads spin for a while after each run, waiting for more
	// work: CPU burnt for nothing between the batches of a document and
	// after it. Embeddings come in bursts; sleeping costs microseconds.
	if err := options.AddSessionConfigEntry("session.intra_op.allow_spinning", "0"); err != nil {
		options.Destroy()
		ready <- fmt.Errorf("error disabling thread spinning: %w", err)
		return
	}
	session, err := ort.NewDynamicAdvancedSession(modelPath, inputNames, []string{outputName}, options)
	options.Destroy()
	if err != nil {
		ready <- fmt.Errorf("error creating the embedding session (%s): %w", e.provider, err)
		return
	}
	defer session.Destroy()
	ready <- nil

	for call := range e.calls {
		vectors, err := embedTexts(tk, session, inputNames, call.texts)
		call.reply <- embedResult{vectors: vectors, err: err}
		if len(call.texts) > 1 {
			releaseFreedMemory() // after a document: give the peak back
		}
	}
}

// embedTexts embeds texts in batches of embedBatchSize, the texts sorted
// by length first: each batch is padded to its longest text, so similar
// lengths together waste less (padding costs memory and time). The
// vectors come back in the order of texts.
func embedTexts(tk *tokenizers.Tokenizer, session *ort.DynamicAdvancedSession, inputNames []string, texts []string) ([][]float32, error) {
	order := make([]int, len(texts))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return len(texts[order[a]]) < len(texts[order[b]]) })

	vectors := make([][]float32, len(texts))
	for start := 0; start < len(order); start += embedBatchSize {
		end := min(start+embedBatchSize, len(order))
		batch := make([]string, 0, end-start)
		for _, i := range order[start:end] {
			batch = append(batch, texts[i])
		}
		out, err := embedBatch(tk, session, inputNames, batch)
		if err != nil {
			return nil, err
		}
		for j, i := range order[start:end] {
			vectors[i] = out[j]
		}
	}
	return vectors, nil
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
