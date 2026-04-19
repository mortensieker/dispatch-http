# dispatch

A lightweight desktop HTTP client for crafting and sending requests. Write `.http` file syntax in the built-in editor, hit send, and inspect responses -- all in a single native window.

![dispatch screenshot](assets/app.jpg)

## Features

- `.http` file syntax with syntax highlighting
- Support for GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS methods
- Request headers and JSON body support
- Response viewer with status, headers, body, and timing
- Auto-save to `~/.config/dispatch/requests.http` (or equivalent config dir)
- Send with `Ctrl+Enter` or click the gutter play button
- Variables — define reusable values with `@name = value` and interpolate with `{{name}}`
- Response chaining — capture response body fields into variables with `@token = {{login.response.body.access_token}}`

## Variables

Declare variables at the top of your file (or anywhere between requests) using `@name = value`. Reference them anywhere in the file with `{{name}}`.

```http
@baseUrl = https://api.example.com
@token = secret123

GET {{baseUrl}}/users
Authorization: Bearer {{token}}
```

### Response chaining

Name a request with `# @name <id>`, then reference its response body fields in later variable declarations:

```http
### Login
# @name login
POST {{baseUrl}}/auth/login
Content-Type: application/json

{ "username": "alice", "password": "secret" }

### Use the token from the login response
@accessToken = {{login.response.body.access_token}}

GET {{baseUrl}}/profile
Authorization: Bearer {{accessToken}}
```

Variable declarations are processed in order, so earlier variables can be referenced by later ones.

## Tech Stack

- **Backend:** Go + [Wails v2](https://wails.io)
- **Frontend:** Svelte + TypeScript + Vite

## Prerequisites

- [Go](https://go.dev/) 1.23+
- [Node.js](https://nodejs.org/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

## Development

```bash
wails dev
```

## Build

```bash
wails build
```

The compiled binary will be in `build/bin/`.

## Releasing

Releases are automated via GitHub Actions. Pushing a version tag triggers a build for Linux, macOS, and Windows, and publishes a GitHub Release with the binaries attached.

1. Make sure all changes are committed and pushed to `main`.

2. Create and push a version tag:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. The [Release workflow](.github/workflows/release.yml) will run automatically and:
   - Build `dispatch` for `linux/amd64`, `darwin/universal`, and `windows/amd64`
   - Bundle each binary into a `.zip` archive
   - Create a GitHub Release with auto-generated release notes and the archives attached

4. Monitor progress in the **Actions** tab on GitHub. Once the workflow completes the release appears under **Releases**.

> Tags must start with `v` (e.g. `v1.2.3`). Use [semantic versioning](https://semver.org/).
