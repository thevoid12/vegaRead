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