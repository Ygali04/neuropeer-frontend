#!/usr/bin/env bash
set -euo pipefail

# ── NeuroPeer Development Setup ─────────────────────────────────────────────
# Idempotent setup script for the NeuroPeer neural simulation engine.
# Re-run safely at any time — it skips steps that are already complete.
# ─────────────────────────────────────────────────────────────────────────────

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ok()   { printf "${GREEN}✓${NC} %s\n" "$1"; }
fail() { printf "${RED}✗${NC} %s\n" "$1"; }
info() { printf "${BLUE}→${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }

header() {
    echo ""
    printf "${BOLD}── %s ──${NC}\n" "$1"
}

# ── Step 1: Check prerequisites ────────────────────────────────────────────
header "Checking prerequisites"

errors=0

# Python 3.11+
if command -v python3 &>/dev/null; then
    py_version=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    py_major=$(echo "$py_version" | cut -d. -f1)
    py_minor=$(echo "$py_version" | cut -d. -f2)
    if [ "$py_major" -ge 3 ] && [ "$py_minor" -ge 11 ]; then
        ok "Python $py_version"
    else
        fail "Python 3.11+ required (found $py_version)"
        errors=$((errors + 1))
    fi
else
    fail "Python 3 not found — install Python 3.11+ from https://python.org"
    errors=$((errors + 1))
fi

# Docker
if command -v docker &>/dev/null; then
    docker_version=$(docker --version | head -1)
    ok "Docker ($docker_version)"
else
    fail "Docker not found — install from https://docs.docker.com/get-docker/"
    errors=$((errors + 1))
fi

# docker compose (v2 plugin)
if docker compose version &>/dev/null 2>&1; then
    compose_version=$(docker compose version --short 2>/dev/null || echo "unknown")
    ok "docker compose ($compose_version)"
elif command -v docker-compose &>/dev/null; then
    warn "Found docker-compose (v1) — consider upgrading to docker compose v2"
    ok "docker-compose (legacy)"
else
    fail "docker compose not found — install Docker Desktop or the compose plugin"
    errors=$((errors + 1))
fi

# ffmpeg
if command -v ffmpeg &>/dev/null; then
    ffmpeg_version=$(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')
    ok "ffmpeg ($ffmpeg_version)"
else
    fail "ffmpeg not found — install via: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)"
    errors=$((errors + 1))
fi

if [ "$errors" -gt 0 ]; then
    echo ""
    fail "Missing $errors prerequisite(s). Install them and re-run this script."
    exit 1
fi

# ── Step 2: Install uv (fast Python package manager) ──────────────────────
header "Python tooling"

if command -v uv &>/dev/null; then
    ok "uv already installed ($(uv --version))"
else
    info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Ensure uv is on PATH for the rest of this script
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    if command -v uv &>/dev/null; then
        ok "uv installed ($(uv --version))"
    else
        fail "uv installation failed — install manually: https://docs.astral.sh/uv/"
        exit 1
    fi
fi

# ── Step 3: Create virtual environment ─────────────────────────────────────
header "Virtual environment"

if [ -d ".venv" ]; then
    ok ".venv already exists"
else
    info "Creating .venv..."
    uv venv .venv
    ok ".venv created"
fi

# ── Step 4: Install dependencies ───────────────────────────────────────────
header "Installing dependencies"

# Activate venv for uv pip commands
export VIRTUAL_ENV="$(pwd)/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"

if [ -f "pyproject.toml" ]; then
    info "Installing from pyproject.toml (editable + dev extras)..."
    uv pip install -e ".[dev]"
    ok "Dependencies installed from pyproject.toml"
elif [ -f "backend/requirements.txt" ]; then
    info "Installing from backend/requirements.txt..."
    uv pip install -r backend/requirements.txt
    ok "Dependencies installed from requirements.txt"
else
    warn "No pyproject.toml or requirements.txt found — skipping dependency install"
fi

# ── Step 5: Pre-commit hooks ──────────────────────────────────────────────
header "Pre-commit hooks"

if [ -f ".pre-commit-config.yaml" ]; then
    if command -v pre-commit &>/dev/null || [ -f ".venv/bin/pre-commit" ]; then
        info "Installing pre-commit hooks..."
        pre-commit install
        ok "Pre-commit hooks installed"
    else
        warn "pre-commit config found but pre-commit not installed — run: pip install pre-commit"
    fi
else
    ok "No .pre-commit-config.yaml — skipping"
fi

# ── Step 6: Environment file ──────────────────────────────────────────────
header "Environment configuration"

if [ -f ".env" ]; then
    ok ".env already exists"
elif [ -f "backend/.env.example" ]; then
    cp backend/.env.example .env
    ok "Copied backend/.env.example to .env — edit it with your credentials"
elif [ -f ".env.example" ]; then
    cp .env.example .env
    ok "Copied .env.example to .env — edit it with your credentials"
else
    warn "No .env.example found — create .env manually"
fi

# ── Step 7: Secrets directory ─────────────────────────────────────────────
header "Secrets directory"

if [ -d "secrets" ]; then
    ok "secrets/ already exists"
else
    mkdir -p secrets
    touch secrets/cookies.txt
    ok "Created secrets/ directory with empty cookies.txt"
fi

# ── Step 8: Start Docker services ────────────────────────────────────────
header "Docker services (postgres, redis, minio)"

info "Starting infrastructure services..."
if docker compose up -d postgres redis minio 2>/dev/null; then
    ok "Docker services started"
elif docker-compose up -d postgres redis minio 2>/dev/null; then
    ok "Docker services started (docker-compose v1)"
else
    fail "Failed to start Docker services — is Docker running?"
    exit 1
fi

# ── Step 9: Wait for PostgreSQL ──────────────────────────────────────────
header "Waiting for PostgreSQL"

max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker compose exec -T postgres pg_isready -U neuropeer &>/dev/null 2>&1; then
        ok "PostgreSQL is ready"
        break
    fi
    attempt=$((attempt + 1))
    printf "."
    sleep 1
done

if [ $attempt -eq $max_attempts ]; then
    warn "PostgreSQL did not become ready within ${max_attempts}s — it may still be starting"
fi

# ── Step 10: Success ─────────────────────────────────────────────────────
echo ""
printf "${GREEN}${BOLD}"
echo "============================================"
echo "  NeuroPeer setup complete!"
echo "============================================"
printf "${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit .env with your credentials:"
echo "     - HF_TOKEN      (HuggingFace — for facebook/tribev2)"
echo "     - SECRET_KEY     (change from default)"
echo "     - DATACRUNCH_CLIENT_ID/SECRET (optional — for remote GPU inference)"
echo ""
echo "  2. Start the full stack:"
echo "     docker compose up"
echo ""
echo "  3. Open the dashboard:"
echo "     http://localhost:3000"
echo ""
echo "  4. API docs (Swagger UI):"
echo "     http://localhost:8000/docs"
echo ""
echo "  5. Run tests:"
echo "     source .venv/bin/activate"
echo "     pytest"
echo ""
