package function_library

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"pipelines/common"
	"pipelines/logger"
	"pipelines/safehttp"
	"pipelines/utils"
)

// Http is go.http of the Function nodes: JSON requests to the internet.
//
// Requests go through the platform's client for user code (package
// safehttp, fm.GetFunctionHttpClient): the platform's internal addresses
// (its services, the Swarm networks, loopback, cloud metadata) cannot be
// reached unless config.yaml allows them (functionHttp). Every request has
// a time limit, and an answer of more than maxHttpResponseBytes is
// refused. On an error the methods log it and return null, as before.
type Http struct {
	node   common.Node
	log    *logger.Logger
	client *http.Client
}

const (
	httpRequestTimeout   = 15 * time.Second
	maxHttpResponseBytes = 10 << 20
)

func NewHttp(node common.Node, fm common.Manager, log *logger.Logger) *Http {
	var client *http.Client
	if fm != nil {
		client = fm.GetFunctionHttpClient()
	}
	if client == nil {
		// No client from the manager: the safe one with no exceptions.
		client, _ = safehttp.NewClient(safehttp.Policy{}, httpRequestTimeout)
	}
	return &Http{node: node, log: log, client: client}
}

// do sends a request (body as JSON when not nil) and returns the answer's
// bytes; only a 2xx answer is a success.
func (h *Http) do(ctx context.Context, method, url string, body interface{}, token string) ([]byte, error) {
	if ctx == nil { // the scripts cannot pass a Go context
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, httpRequestTimeout)
	defer cancel()

	var reader io.Reader
	if body != nil || method == http.MethodPost || method == http.MethodPatch {
		data := []byte("{}")
		if body != nil {
			var err error
			if data, err = json.Marshal(body); err != nil {
				return nil, fmt.Errorf("failed to marshal data: %v", err)
			}
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}
	if reader != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d %s", resp.StatusCode, resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxHttpResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("error reading response: %w", err)
	}
	if len(data) > maxHttpResponseBytes {
		return nil, fmt.Errorf("the response is larger than %d MB", maxHttpResponseBytes>>20)
	}
	return data, nil
}

// request runs a request for a script: the answer decoded from JSON, or
// nil (logged) on an error.
func (h *Http) request(ctx context.Context, what, method, url string, body interface{}, token string) interface{} {
	response, err := h.do(ctx, method, url, body, token)
	if err != nil {
		if safehttp.IsBlocked(err) {
			h.log.Errorf("Function node HTTP %s %s refused: %v (internal addresses are not reachable from the pipelines; see functionHttp in the configuration)", method, url, err)
		} else {
			h.log.Errorf("Failed to %s: %v", what, err)
		}
		return nil
	}
	if len(bytes.TrimSpace(response)) == 0 {
		return nil
	}
	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal the response to %s: %v", what, err)
	}
	return responseData
}

func (h *Http) Get(url string) interface{} {
	return h.request(context.Background(), "get HTTP response", http.MethodGet, url, nil, "")
}

func (h *Http) GetWithJwt(ctx context.Context, url string, token string) interface{} {
	return h.request(ctx, "get HTTP response with JWT", http.MethodGet, url, nil, token)
}

func (h *Http) Post(url string, body interface{}) interface{} {
	return h.request(context.Background(), "post HTTP request", http.MethodPost, url, body, "")
}

func (h *Http) PostWithJwt(ctx context.Context, url string, body interface{}, token string) interface{} {
	return h.request(ctx, "post HTTP request with JWT", http.MethodPost, url, body, token)
}

func (h *Http) Patch(url string, body interface{}) interface{} {
	return h.request(context.Background(), "patch HTTP request", http.MethodPatch, url, body, "")
}

func (h *Http) PatchWithJwt(ctx context.Context, url string, body interface{}, token string) interface{} {
	return h.request(ctx, "patch HTTP request with JWT", http.MethodPatch, url, body, token)
}

func (h *Http) Delete(url string) interface{} {
	return h.request(context.Background(), "delete HTTP request", http.MethodDelete, url, nil, "")
}

func (h *Http) DeleteWithJwt(ctx context.Context, url string, token string) interface{} {
	return h.request(ctx, "delete HTTP request with JWT", http.MethodDelete, url, nil, token)
}
