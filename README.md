# Portable macOS terminal setup

One repository for Rachit's terminal-first development environment:

- [Ghostty](https://ghostty.org/) with Catppuccin, Meslo Nerd Font, macOS glass, and TUI-friendly keys
- [Herdr](https://herdr.dev/) with the saved UI/theme configuration and current Pi integration
- [Neovim](https://neovim.io/) with the pinned LazyVim configuration for Go, Java, Node/TypeScript, Python, and Markdown
- [Pi](https://pi.dev/) with settings, extensions, packages, theme, custom skills, and Matt Pocock's skills
- Claude Code, language toolchains, formatters, search tools, and terminal dependencies

## Install a fresh Mac

Open Terminal on macOS and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Rachit-Gandhi/terminal/main/install.sh | bash
```

The bootstrap installs Homebrew when needed, clones this repository to
`~/workspace/github.com/Rachit-Gandhi/terminal`, installs everything in the
`Brewfile`, restores configuration, installs current Herdr integrations, clones
Matt Pocock's skills, restores Pi packages, and synchronizes Neovim plugins.
Homebrew may ask for the macOS account password while installing prerequisites.

Alternatively:

```bash
git clone https://github.com/Rachit-Gandhi/terminal.git \
  ~/workspace/github.com/Rachit-Gandhi/terminal
cd ~/workspace/github.com/Rachit-Gandhi/terminal
./install.sh
```

Use a different checkout location with `TERMINAL_CONFIG_REPO`, or a fork with
`TERMINAL_CONFIG_REPO_URL`.

After installation, restart Ghostty and authenticate Pi interactively:

```text
pi
/login
```

Credentials cannot safely be restored from GitHub.

## What the installer manages

| Tool | Repository source | Installed location |
| --- | --- | --- |
| Neovim | `nvim/` | `~/.config/nvim` symlink |
| Ghostty | `ghostty/` | `~/.config/ghostty` symlink |
| Herdr | `herdr/config.toml` | `~/.config/herdr/config.toml` symlink |
| Pi | `pi/agent/` | selected files copied into `~/.pi/agent/` |
| Matt Pocock skills | upstream Git checkout | `~/.pi/agent/skills/matt-pocock` |

Herdr logs, sockets, and session state remain under `~/.config/herdr` rather
than entering Git. Pi authentication, sessions, trust decisions, package caches,
and Mind Queue state also remain local.

Existing managed paths are backed up with a `.backup-YYYYMMDD-HHMMSS` suffix
before replacement. Re-running the installer is supported.

## Verify or repair

Run the complete non-destructive check:

```bash
./install.sh --check
```

For Neovim alone:

```bash
./nvim/install.sh --check
```

Herdr configuration can be checked and reloaded with:

```bash
herdr config check
herdr server reload-config
herdr integration status
```

## Keeping the setup portable

Neovim, Ghostty, and Herdr configuration are symlinked, so editing their live
configuration edits this checkout directly. Review and commit normally:

```bash
git status
git add nvim ghostty herdr Brewfile install.sh README.md
git commit -m "Update terminal setup"
git push
```

Pi resources are copied because `~/.pi/agent` also contains credentials,
runtime state, and machine-private skills. This repository is intentionally
**one-way**: it never scans `~/.pi/agent` or automatically commits local files.
Update public Pi resources by editing `pi/agent/` in this checkout explicitly.

The generated Herdr integration, downloaded Matt Pocock checkout, authentication,
sessions, trust data, state, research notes, disabled tools, and machine-access
skills are intentionally excluded. The installer recreates only the generated
upstream resources.

## Updating

```bash
cd ~/workspace/github.com/Rachit-Gandhi/terminal
git pull --ff-only
./install.sh
```

Inside Neovim, use `:Lazy update` when intentionally updating plugin pins and
commit `nvim/lazy-lock.json`. Inside Pi, `/matt-pocock-skills soft-resync`
updates Matt Pocock's skills without discarding local changes.
