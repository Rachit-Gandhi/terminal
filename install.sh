#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TERMINAL_CONFIG_REPO_URL:-https://github.com/Rachit-Gandhi/terminal.git}"
INSTALL_DIR="${TERMINAL_CONFIG_REPO:-$HOME/workspace/github.com/Rachit-Gandhi/terminal}"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
timestamp="$(date +%Y%m%d-%H%M%S)"

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage: ./install.sh [--check]

Install the complete macOS terminal environment and restore its configuration.
When piped from GitHub, the script clones the repository first.

  --check  Validate the installed tools and configuration without changing them.
EOF
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This bootstrap currently supports macOS only." >&2
    exit 1
  fi
}

setup_brew_shellenv() {
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_homebrew() {
  setup_brew_shellenv
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  log "Installing Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  setup_brew_shellenv
  command -v brew >/dev/null 2>&1 || {
    echo "Homebrew installed but is not available on PATH. Open a new terminal and rerun this script." >&2
    exit 1
  }
}

resolve_repo() {
  local script_source="${BASH_SOURCE[0]:-}"
  local candidate=""
  if [[ -n "$script_source" && -f "$script_source" ]]; then
    candidate="$(cd -- "$(dirname -- "$script_source")" && pwd)"
  fi

  if [[ -n "$candidate" && -f "$candidate/Brewfile" && -d "$candidate/nvim" ]]; then
    printf '%s\n' "$candidate"
    return
  fi

  log "Cloning terminal configuration into $INSTALL_DIR" >&2
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    git -C "$INSTALL_DIR" pull --ff-only >&2
  elif [[ -e "$INSTALL_DIR" ]]; then
    echo "$INSTALL_DIR exists but is not a Git checkout; move it aside or set TERMINAL_CONFIG_REPO." >&2
    exit 1
  else
    mkdir -p "$(dirname -- "$INSTALL_DIR")"
    git clone "$REPO_URL" "$INSTALL_DIR" >&2
  fi
  printf '%s\n' "$INSTALL_DIR"
}

backup_path() {
  local target="$1"
  local backup="${target}.backup-${timestamp}"
  mv "$target" "$backup"
  echo "Backed up $target to $backup"
}

link_config() {
  local source="$1" target="$2"
  mkdir -p "$(dirname -- "$target")"

  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    echo "$target already points to this checkout."
    return
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    backup_path "$target"
  fi
  ln -s "$source" "$target"
  echo "Linked $target -> $source"
}

install_managed_file() {
  local source="$1" target="$2" backup="$3"
  mkdir -p "$(dirname -- "$target")"

  if [[ -f "$target" ]] && cmp -s "$source" "$target"; then
    return
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    mkdir -p "$(dirname -- "$backup")"
    cp -pLR "$target" "$backup" 2>/dev/null || true
    rm -rf "$target"
  fi
  cp -p "$source" "$target"
}

install_pi_config() {
  local source_root="$1/pi/agent"
  local backup_root="$PI_AGENT_DIR/backups/terminal-${timestamp}"
  mkdir -p "$PI_AGENT_DIR"

  while IFS= read -r -d '' source; do
    local relative_path="${source#"$source_root"/}"
    install_managed_file "$source" "$PI_AGENT_DIR/$relative_path" "$backup_root/$relative_path"
  done < <(find "$source_root" -type f -print0)

  printf '%s\n' "$1" > "$PI_AGENT_DIR/.terminal-config-repo"
}

install_matt_skills() {
  local target="$PI_AGENT_DIR/skills/matt-pocock"
  local url="https://github.com/mattpocock/skills.git"
  mkdir -p "$(dirname -- "$target")"

  if [[ -d "$target/.git" ]]; then
    git -C "$target" fetch --prune origin
    git -C "$target" pull --ff-only --autostash || warn "Matt Pocock skills have local/diverged changes; leaving them intact."
  elif [[ -e "$target" ]]; then
    backup_path "$target"
    git clone "$url" "$target"
  else
    git clone "$url" "$target"
  fi
}

check_installation() {
  local repo_root="$1"
  local failed=0
  local command

  log "Checking Homebrew dependencies"
  brew bundle check --file="$repo_root/Brewfile" || failed=1

  log "Checking commands"
  for command in ghostty herdr nvim node npm pi; do
    if command -v "$command" >/dev/null 2>&1; then
      printf '%-8s %s\n' "$command" "$(command -v "$command")"
    else
      echo "Missing command: $command" >&2
      failed=1
    fi
  done

  log "Checking managed configuration"
  [[ -L "$HOME/.config/nvim" && "$(readlink "$HOME/.config/nvim")" == "$repo_root/nvim" ]] || {
    echo "Neovim config is not linked to $repo_root/nvim" >&2
    failed=1
  }
  [[ -L "$HOME/.config/ghostty" && "$(readlink "$HOME/.config/ghostty")" == "$repo_root/ghostty" ]] || {
    echo "Ghostty config is not linked to $repo_root/ghostty" >&2
    failed=1
  }
  [[ -L "$HOME/.config/herdr/config.toml" && "$(readlink "$HOME/.config/herdr/config.toml")" == "$repo_root/herdr/config.toml" ]] || {
    echo "Herdr config is not linked to $repo_root/herdr/config.toml" >&2
    failed=1
  }

  herdr config check || failed=1
  "$repo_root/nvim/install.sh" --check || failed=1
  [[ -d "$PI_AGENT_DIR/skills/matt-pocock/.git" ]] || {
    echo "Matt Pocock skills checkout is missing." >&2
    failed=1
  }
  pi list || failed=1

  if (( failed )); then
    echo "One or more checks failed." >&2
    exit 1
  fi
  echo "All terminal setup checks passed."
}

main() {
  require_macos
  case "${1:-}" in
    ""|--check) ;;
    -h|--help) usage; return ;;
    *) usage >&2; exit 2 ;;
  esac

  ensure_homebrew
  local repo_root
  repo_root="$(resolve_repo)"

  if [[ "${1:-}" == "--check" ]]; then
    check_installation "$repo_root"
    return
  fi

  log "Installing Homebrew tools and applications"
  brew bundle install --file="$repo_root/Brewfile"

  log "Installing coding-agent CLIs"
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  npm install -g @anthropic-ai/claude-code

  log "Linking Neovim, Ghostty, and Herdr configuration"
  link_config "$repo_root/nvim" "$HOME/.config/nvim"
  link_config "$repo_root/ghostty" "$HOME/.config/ghostty"
  link_config "$repo_root/herdr/config.toml" "$HOME/.config/herdr/config.toml"

  log "Restoring non-secret Pi configuration"
  install_pi_config "$repo_root"
  install_matt_skills
  pi update --extensions || warn "Pi packages could not be reconciled; Pi will retry on startup."

  log "Installing current Herdr agent integrations"
  herdr integration install pi
  if command -v claude >/dev/null 2>&1; then
    herdr integration install claude || warn "Claude integration was not installed."
  fi
  herdr server reload-config >/dev/null 2>&1 || true

  log "Installing zsh completion"
  local completion_dir
  completion_dir="$(brew --prefix)/share/zsh/site-functions"
  mkdir -p "$completion_dir"
  herdr completion zsh > "$completion_dir/_herdr"

  log "Synchronizing Neovim plugins"
  nvim --headless '+Lazy! sync' +qa

  cat <<EOF

Portable terminal setup installed from:
  $repo_root

Next steps:
  1. Restart Ghostty.
  2. Run 'pi', then '/login' to restore provider credentials.
  3. Run './install.sh --check' from the checkout to verify everything.

Secrets and machine state were intentionally not restored.
EOF
}

main "$@"
