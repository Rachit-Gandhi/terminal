#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="${XDG_CONFIG_HOME:-$HOME/.config}/nvim"
timestamp="$(date +%Y%m%d-%H%M%S)"

usage() {
  cat <<'EOF'
Usage: ./install.sh [--check]

  Install this checkout as ~/.config/nvim and synchronize plugins.
  --check  Validate the configuration without changing symlinks or plugins.
EOF
}

check_requirements() {
  command -v nvim >/dev/null 2>&1 || {
    echo "Error: nvim is not installed or not on PATH." >&2
    exit 1
  }

  local version
  version="$(nvim --version | awk 'NR == 1 { print; exit }')"
  echo "${version} detected."
}

check_config() {
  echo "Checking Neovim configuration..."
  nvim --headless -u "$repo_dir/init.lua" +'LivePreview help' \
    +'lua assert(vim.api.nvim_get_commands({}).LivePreview, "LivePreview command missing")' \
    +'lua assert(require("lazy.core.config").plugins["nvim-jdtls"], "Java support missing")' \
    +'lua assert(require("lazy.core.config").plugins["nvim-dap"], "debugger support missing")' +qa
  echo "Configuration loads successfully."
}

install_config() {
  mkdir -p "$(dirname -- "$target")"

  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -L "$target" && "$(readlink -- "$target")" == "$repo_dir" ]]; then
      echo "$target already points to this checkout."
    else
      local backup="${target}.backup-${timestamp}"
      mv "$target" "$backup"
      echo "Backed up existing config to $backup"
      ln -s "$repo_dir" "$target"
    fi
  else
    ln -s "$repo_dir" "$target"
  fi

  echo "Synchronizing plugins..."
  nvim --headless '+Lazy! sync' +qa
  check_config
}

main() {
  case "${1:-}" in
    "")
      check_requirements
      install_config
      echo "Installed. Restart Neovim or run: nvim"
      ;;
    --check)
      check_requirements
      check_config
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
