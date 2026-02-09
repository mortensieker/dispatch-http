package main

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type App struct {
	ctx    context.Context
	client *http.Client
}

func NewApp() *App {
	return &App{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

type Response struct {
	Status   int               `json:"status"`
	Headers  map[string]string `json:"headers"`
	Body     string            `json:"body"`
	Duration int64             `json:"duration"`
	Error    string            `json:"error,omitempty"`
}

func (a *App) dataDir() string {
	cfg, err := os.UserConfigDir()
	if err != nil {
		cfg = "."
	}
	return filepath.Join(cfg, "dispatch")
}

func (a *App) defaultFilePath() string {
	return filepath.Join(a.dataDir(), "requests.http")
}

func (a *App) GetFilePath() string {
	return a.defaultFilePath()
}

func (a *App) LoadFile() string {
	data, err := os.ReadFile(a.defaultFilePath())
	if err != nil {
		return ""
	}
	return string(data)
}

func (a *App) SaveFile(content string) error {
	dir := a.dataDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(a.defaultFilePath(), []byte(content), 0644)
}

func (a *App) Execute(method, url string, body string) Response {
	start := time.Now()

	var requestBody io.Reader
	if body != "" {
		requestBody = strings.NewReader(body)
	}

	req, err := http.NewRequest(method, url, requestBody)
	if err != nil {
		return Response{Error: err.Error()}
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return Response{Error: err.Error(), Duration: time.Since(start).Milliseconds()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	headers := make(map[string]string)
	for key := range resp.Header {
		headers[key] = resp.Header.Get(key)
	}

	return Response{
		Status:   resp.StatusCode,
		Headers:  headers,
		Body:     string(respBody),
		Duration: time.Since(start).Milliseconds(),
	}
}
