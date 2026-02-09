package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var version = "dev"

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

type UpdateInfo struct {
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	UpdateAvailable bool   `json:"updateAvailable"`
	ReleaseURL      string `json:"releaseURL"`
}

func (a *App) GetVersion() string {
	return version
}

func (a *App) CheckForUpdate() UpdateInfo {
	info := UpdateInfo{CurrentVersion: version}
	if version == "dev" {
		return info
	}

	req, err := http.NewRequest("GET", "https://api.github.com/repos/mortensieker/dispatch-http/releases/latest", nil)
	if err != nil {
		return info
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := a.client.Do(req)
	if err != nil {
		return info
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return info
	}

	var release struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return info
	}

	info.LatestVersion = release.TagName
	info.ReleaseURL = release.HTMLURL
	info.UpdateAvailable = isNewer(release.TagName, version)
	return info
}

// isNewer returns true if latest is a higher semver than current.
func isNewer(latest, current string) bool {
	parse := func(s string) (int, int, int, bool) {
		s = strings.TrimPrefix(s, "v")
		parts := strings.SplitN(s, ".", 3)
		if len(parts) != 3 {
			return 0, 0, 0, false
		}
		maj, e1 := strconv.Atoi(parts[0])
		min, e2 := strconv.Atoi(parts[1])
		pat, e3 := strconv.Atoi(parts[2])
		if e1 != nil || e2 != nil || e3 != nil {
			return 0, 0, 0, false
		}
		return maj, min, pat, true
	}

	lMaj, lMin, lPat, lok := parse(latest)
	cMaj, cMin, cPat, cok := parse(current)
	if !lok || !cok {
		return false
	}

	lVal := fmt.Sprintf("%09d%09d%09d", lMaj, lMin, lPat)
	cVal := fmt.Sprintf("%09d%09d%09d", cMaj, cMin, cPat)
	return lVal > cVal
}
