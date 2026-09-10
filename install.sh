#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TERMINAL_CONFIG_REPO_URL:-https://github.com/Rachit-Gandhi/terminal.git}"
INSTALL_DIR="${TERMINAL_CONFIG_REPO:-$HOME/workspace/github.com/Rachit-Gandhi/terminal}"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/terminal-config"
timestamp="$(date +%Y%m%d-%H%M%S)"

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage: ./install.sh [COMMAND]

Install, synchronize, update, or remove the macOS terminal environment.
When piped from GitHub, the script clones the repository first.

  --sync                 Apply the checked-in setup (default)
  --update               Pull repository changes, then sync
  --upgrade              Pull changes and upgrade managed tools and plugins
  --check                Validate tools and configuration without changes
  --uninstall [OPTIONS]  Remove managed configuration and integrations
  -h, --help             Show this help

Uninstall options:
  --yes                  Skip the confirmation prompt
  --keep-packages        Keep Homebrew and global npm packages
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

pull_repo() {
  local repo_root="$1"
  if [[ ! -d "$repo_root/.git" ]]; then
    warn "$repo_root is not a Git checkout; skipping repository update."
    return
  fi

  log "Updating terminal configuration repository"
  git -C "$repo_root" pull --ff-only
}

record_backup() {
  local target="$1" backup="$2"
  mkdir -p "$STATE_DIR"
  printf '%s\t%s\n' "$target" "$backup" >> "$STATE_DIR/backups"
}

backup_path() {
  local target="$1"
  local backup="${target}.backup-${timestamp}"
  mv "$target" "$backup"
  record_backup "$target" "$backup"
  echo "Backed up $target to $backup"
}

restore_recorded_backup() {
  local target="$1" recorded_target recorded_backup backup=""
  [[ -f "$STATE_DIR/backups" ]] || return 0

  while IFS=$'\t' read -r recorded_target recorded_backup; do
    if [[ "$recorded_target" == "$target" ]]; then
      backup="$recorded_backup"
    fi
  done < "$STATE_DIR/backups"

  if [[ -n "$backup" && -e "$backup" && ! -e "$target" && ! -L "$target" ]]; then
    mv "$backup" "$target"
    echo "Restored $target from $backup"
  fi
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

mark_managed_checkout() {
  local target="$1"
  mkdir -p "$STATE_DIR"
  touch "$STATE_DIR/checkouts"
  grep -Fqx "$target" "$STATE_DIR/checkouts" || printf '%s\n' "$target" >> "$STATE_DIR/checkouts"
}

install_git_checkout() {
  local url="$1" target="$2" label="$3"
  mkdir -p "$(dirname -- "$target")"

  if [[ -d "$target/.git" ]]; then
    git -C "$target" fetch --prune origin
    git -C "$target" pull --ff-only --autostash || warn "$label has local or diverged changes; leaving them intact."
  elif [[ -e "$target" ]]; then
    backup_path "$target"
    git clone "$url" "$target"
    mark_managed_checkout "$target"
  else
    git clone "$url" "$target"
    mark_managed_checkout "$target"
  fi
}

install_shell_tools() {
  install_git_checkout \
    "https://github.com/ohmyzsh/ohmyzsh.git" \
    "$HOME/.oh-my-zsh" \
    "Oh My Zsh"
  install_git_checkout \
    "https://github.com/zsh-users/zsh-autosuggestions.git" \
    "$HOME/.zsh/plugins/zsh-autosuggestions" \
    "zsh-autosuggestions"
  install_git_checkout \
    "https://github.com/zsh-users/zsh-history-substring-search.git" \
    "$HOME/.zsh/plugins/zsh-history-substring-search" \
    "zsh-history-substring-search"
  install_git_checkout \
    "https://github.com/zsh-users/zsh-syntax-highlighting.git" \
    "$HOME/.zsh/plugins/zsh-syntax-highlighting" \
    "zsh-syntax-highlighting"
}

install_matt_skills() {
  install_git_checkout \
    "https://github.com/mattpocock/skills.git" \
    "$PI_AGENT_DIR/skills/matt-pocock" \
    "Matt Pocock skills"
}

install_herdr_integrations() {
  log "Installing current Herdr agent integrations"
  herdr integration install pi
  if command -v claude >/dev/null 2>&1; then
    herdr integration install claude || warn "Claude integration was not installed."
  fi
  herdr server reload-config >/dev/null 2>&1 || true
}

install_zsh_completion() {
  log "Installing zsh completion"
  local completion_dir
  completion_dir="$(brew --prefix)/share/zsh/site-functions"
  mkdir -p "$completion_dir"
  herdr completion zsh > "$completion_dir/_herdr"
}

sync_installation() {
  local repo_root="$1"

  log "Installing Homebrew tools and applications"
  brew bundle install --file="$repo_root/Brewfile"

  log "Installing coding-agent CLIs"
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  npm install -g @anthropic-ai/claude-code

  log "Linking terminal, shell, and prompt configuration"
  link_config "$repo_root/nvim" "$HOME/.config/nvim"
  link_config "$repo_root/ghostty" "$HOME/.config/ghostty"
  link_config "$repo_root/herdr/config.toml" "$HOME/.config/herdr/config.toml"
  link_config "$repo_root/starship/starship.toml" "$HOME/.config/starship.toml"
  link_config "$repo_root/zsh/.zshrc" "$HOME/.zshrc"
  link_config "$repo_root/zsh/.zprofile" "$HOME/.zprofile"
  link_config "$repo_root/bin/terminal" "$HOME/.local/bin/terminal"

  log "Installing shell plugins"
  install_shell_tools

  log "Restoring non-secret Pi configuration"
  install_pi_config "$repo_root"
  install_matt_skills
  pi update --extensions || warn "Pi packages could not be reconciled; Pi will retry on startup."

  install_herdr_integrations
  install_zsh_completion

  log "Synchronizing Neovim plugins"
  nvim --headless '+Lazy! sync' +qa

  cat <<EOF

Portable terminal setup synchronized from:
  $repo_root

Open a new terminal, then run 'terminal check' to verify everything.
Provider credentials and machine state were intentionally not restored.
EOF
}

upgrade_installation() {
  local repo_root="$1"
  pull_repo "$repo_root"

  log "Updating Homebrew and upgrading installed packages"
  brew update
  brew upgrade

  sync_installation "$repo_root"

  log "Upgrading Pi and installed Pi packages"
  pi update --all || warn "Pi could not update every package."

  log "Updating Neovim plugin pins"
  nvim --headless '+Lazy! update' +qa

  echo "Upgrade complete. Review git status for changed lockfiles or configuration."
}

check_link() {
  local source="$1" target="$2" label="$3"
  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    return 0
  fi
  echo "$label is not linked to $source" >&2
  return 1
}

check_installation() {
  local repo_root="$1"
  local failed=0
  local command

  log "Checking Homebrew dependencies"
  brew bundle check --file="$repo_root/Brewfile" || failed=1

  log "Checking commands"
  for command in ghostty herdr nvim node npm pi starship zoxide eza bat fnm; do
    if command -v "$command" >/dev/null 2>&1; then
      printf '%-10s %s\n' "$command" "$(command -v "$command")"
    else
      echo "Missing command: $command" >&2
      failed=1
    fi
  done

  log "Checking managed configuration"
  check_link "$repo_root/nvim" "$HOME/.config/nvim" "Neovim config" || failed=1
  check_link "$repo_root/ghostty" "$HOME/.config/ghostty" "Ghostty config" || failed=1
  check_link "$repo_root/herdr/config.toml" "$HOME/.config/herdr/config.toml" "Herdr config" || failed=1
  check_link "$repo_root/starship/starship.toml" "$HOME/.config/starship.toml" "Starship config" || failed=1
  check_link "$repo_root/zsh/.zshrc" "$HOME/.zshrc" "Zsh config" || failed=1
  check_link "$repo_root/zsh/.zprofile" "$HOME/.zprofile" "Zsh profile" || failed=1
  check_link "$repo_root/bin/terminal" "$HOME/.local/bin/terminal" "Terminal command" || failed=1

  ghostty +validate-config || failed=1
  STARSHIP_CONFIG="$repo_root/starship/starship.toml" starship print-config >/dev/null || failed=1
  zsh -n "$repo_root/zsh/.zshrc" "$repo_root/zsh/.zprofile" || failed=1
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

remove_managed_link() {
  local source="$1" target="$2"
  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    rm "$target"
    echo "Removed $target"
    restore_recorded_backup "$target"
  elif [[ -e "$target" || -L "$target" ]]; then
    warn "Leaving $target because it is not the managed symlink."
  fi
}

remove_pi_config() {
  local repo_root="$1"
  local source_root="$repo_root/pi/agent"

  while IFS= read -r -d '' source; do
    local relative_path="${source#"$source_root"/}"
    local target="$PI_AGENT_DIR/$relative_path"
    if [[ -f "$target" ]] && cmp -s "$source" "$target"; then
      rm "$target"
      echo "Removed $target"
    elif [[ -e "$target" || -L "$target" ]]; then
      local backup="${target}.backup-${timestamp}"
      mv "$target" "$backup"
      warn "Preserved modified Pi file as $backup"
    fi
  done < <(find "$source_root" -type f -print0)

  rm -f "$PI_AGENT_DIR/.terminal-config-repo"
}

checkout_was_managed() {
  local target="$1"
  [[ -f "$STATE_DIR/checkouts" ]] && grep -Fqx "$target" "$STATE_DIR/checkouts"
}

remove_managed_checkout() {
  local target="$1"
  if checkout_was_managed "$target"; then
    if [[ -d "$target/.git" && -n "$(git -C "$target" status --porcelain 2>/dev/null)" ]]; then
      local preserved="${target}.backup-${timestamp}"
      mv "$target" "$preserved"
      warn "Preserved modified checkout as $preserved"
    else
      rm -rf "$target"
      echo "Removed installer-created checkout $target"
    fi
    restore_recorded_backup "$target"
  elif [[ -e "$target" ]]; then
    warn "Leaving pre-existing checkout $target"
  fi
}

uninstall_brew_bundle() {
  local repo_root="$1" package

  while IFS= read -r package; do
    [[ -n "$package" ]] || continue
    brew uninstall --cask --force "$package" || warn "Could not uninstall cask $package"
  done < <(brew bundle list --cask --file="$repo_root/Brewfile")

  while IFS= read -r package; do
    [[ -n "$package" ]] || continue
    brew uninstall --force "$package" || warn "Could not uninstall formula $package"
  done < <(brew bundle list --formula --file="$repo_root/Brewfile")
}

uninstall_installation() {
  local repo_root="$1"
  shift
  local assume_yes=0 keep_packages=0 option

  for option in "$@"; do
    case "$option" in
      --yes) assume_yes=1 ;;
      --keep-packages) keep_packages=1 ;;
      *) echo "Unknown uninstall option: $option" >&2; exit 2 ;;
    esac
  done

  if (( ! assume_yes )); then
    if [[ ! -t 0 ]]; then
      echo "Uninstall requires an interactive terminal or --yes." >&2
      exit 2
    fi
    cat <<'EOF'
This removes managed config links, generated integrations, copied public Pi
files, and installer-created checkouts. By default it also uninstalls packages
listed in the Brewfile and the globally installed Pi and Claude CLIs.

The Git checkout, credentials, sessions, backups, and pre-existing checkouts
are retained.
EOF
    printf 'Continue? [y/N] '
    read -r reply
    [[ "$reply" == [yY] || "$reply" == [yY][eE][sS] ]] || {
      echo "Uninstall cancelled."
      return
    }
  fi

  log "Removing Herdr integrations"
  command -v herdr >/dev/null 2>&1 && {
    herdr integration uninstall pi || true
    herdr integration uninstall claude || true
  }

  log "Removing copied Pi configuration"
  remove_pi_config "$repo_root"

  log "Removing managed configuration links"
  remove_managed_link "$repo_root/nvim" "$HOME/.config/nvim"
  remove_managed_link "$repo_root/ghostty" "$HOME/.config/ghostty"
  remove_managed_link "$repo_root/herdr/config.toml" "$HOME/.config/herdr/config.toml"
  remove_managed_link "$repo_root/starship/starship.toml" "$HOME/.config/starship.toml"
  remove_managed_link "$repo_root/zsh/.zshrc" "$HOME/.zshrc"
  remove_managed_link "$repo_root/zsh/.zprofile" "$HOME/.zprofile"

  if command -v brew >/dev/null 2>&1; then
    rm -f "$(brew --prefix)/share/zsh/site-functions/_herdr"
  fi

  log "Removing installer-created Git checkouts"
  remove_managed_checkout "$HOME/.oh-my-zsh"
  remove_managed_checkout "$HOME/.zsh/plugins/zsh-autosuggestions"
  remove_managed_checkout "$HOME/.zsh/plugins/zsh-history-substring-search"
  remove_managed_checkout "$HOME/.zsh/plugins/zsh-syntax-highlighting"
  remove_managed_checkout "$PI_AGENT_DIR/skills/matt-pocock"

  if (( ! keep_packages )); then
    log "Removing global coding-agent CLIs"
    command -v npm >/dev/null 2>&1 && \
      npm uninstall -g @earendil-works/pi-coding-agent @anthropic-ai/claude-code || true

    if command -v brew >/dev/null 2>&1; then
      log "Removing packages listed in the Brewfile"
      uninstall_brew_bundle "$repo_root"
    fi
  fi

  remove_managed_link "$repo_root/bin/terminal" "$HOME/.local/bin/terminal"
  rm -rf "$STATE_DIR"

  cat <<EOF

Managed terminal setup removed. The repository remains at:
  $repo_root

Review and remove that checkout and any *.backup-* files manually if they are
no longer needed. Homebrew itself and personal credentials/state were retained.
EOF
}

main() {
  require_macos
  local action="${1:---sync}"
  case "$action" in
    --sync|--update|--upgrade|--check|--uninstall) ;;
    -h|--help) usage; return ;;
    *) usage >&2; exit 2 ;;
  esac

  setup_brew_shellenv
  local repo_root
  repo_root="$(resolve_repo)"

  case "$action" in
    --check)
      command -v brew >/dev/null 2>&1 || {
        echo "Homebrew is not installed." >&2
        exit 1
      }
      check_installation "$repo_root"
      ;;
    --uninstall)
      uninstall_installation "$repo_root" "${@:2}"
      ;;
    --update)
      ensure_homebrew
      pull_repo "$repo_root"
      sync_installation "$repo_root"
      ;;
    --upgrade)
      ensure_homebrew
      upgrade_installation "$repo_root"
      ;;
    --sync)
      ensure_homebrew
      sync_installation "$repo_root"
      ;;
  esac
}

main "$@"
