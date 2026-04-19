.PHONY: dev build test install clean

# Run in development mode (hot reload)
dev:
	wails dev

# Build production binary
build:
	wails build

# Run frontend tests
test:
	cd frontend && npx vitest run

# Install all dependencies
install:
	go mod download
	cd frontend && npm install

# Remove build output
clean:
	rm -rf build/bin
