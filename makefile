.PHONY: all check lint lint-fix fmt fmt-check audit dev build clean release bloat

all: fmt-check lint check

dev:
	bun tauri dev

bloat:
	cd src-tauri && cargo bloat --release --crates
# ── Code quality ──────────────────────────────────────────────────────────────
check:
	cd src-tauri && cargo check

lint:
	cd src-tauri && cargo clippy -- -D warnings

lint-fix:
	cd src-tauri && cargo clippy --fix --allow-dirty --allow-staged

fmt:
	cd src-tauri && cargo fmt

fmt-check:
	cd src-tauri && cargo fmt -- --check

audit:
	cd src-tauri && cargo install cargo-audit --locked --quiet && cargo audit

# ── Build (current platform only) ─────────────────────────────────────────────
# Output: src-tauri/target/release/bundle/
#   Linux  → .deb  +  .AppImage
#   macOS  → .dmg  +  .pkg
#   Windows → .msi  +  nsis .exe
build:
	bun tauri build

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	cd src-tauri && cargo clean
	rm -rf node_modules/.vite

# --------local release build -----------------
# bun tauri build automatically runs beforeBuildCommand (bun run build) first,
# then cargo build --release, then bundles into the platform artifact.
# Output: src-tauri/target/release/bundle/
local-release:
	bun tauri build
# 	@echo "building the frontend using vite"
# 	bun run build
# 	@echo "building the release rust binary with built frontend statically linked"
# 	cargo build --release
# 	@echo "bundle the executable"
# 	tauri bundler



# ── Remote release (all platforms via GitHub Actions) ─────────────────────────
# Usage: make release v=1.0.0
# Bumps version in tauri.conf.json + Cargo.toml, commits, tags, and pushes.
# GitHub Actions picks up the tag and builds Linux/macOS/Windows in parallel.
release:
	@if [ -z "$(v)" ]; then \
		echo "Usage: make release v=1.2.3"; \
		exit 1; \
	fi
	@echo "Bumping version to $(v)..."
	sed -i 's/"version": "[^"]*"/"version": "$(v)"/' src-tauri/tauri.conf.json
	sed -i '0,/^version = "[^"]*"/s//version = "$(v)"/' src-tauri/Cargo.toml
	git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
	git commit -m "chore: release v$(v)"
	git tag -a "v$(v)" -m "release v$(v)"
	git push origin main
	git push origin "v$(v)"
	@echo "Tag v$(v) pushed — GitHub Actions will build and publish the draft release."