.PHONY: dev build test install clean release

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

# Release: make release TAG=v1.2.3
release: guard-TAG test
	git tag $(TAG)
	git push origin main $(TAG)

guard-%:
	@[ -n "$($(*))" ] || (echo "Error: $* is required. Usage: make release TAG=v1.2.3"; exit 1)
