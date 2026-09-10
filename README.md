# Portable macOS terminal setup

One repository for Rachit's terminal-first development environment:

- [Ghostty](https://ghostty.org/) with Catppuccin, Meslo Nerd Font, macOS glass, and TUI-friendly keys
- Zsh, Oh My Zsh, shell plugins, [Starship](https://starship.rs/), Zoxide, FZF, Eza, and Bat
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
shell plugins and Matt Pocock's skills, restores Pi packages, and synchronizes
Neovim plugins. Homebrew may ask for the macOS account password while
installing prerequisites.

Alternatively:

```bash
git clone https://github.com/Rachit-Gandhi/terminal.git \
  ~/workspace/github.com/Rachit-Gandhi/terminal
cd ~/workspace/github.com/Rachit-Gandhi/terminal
./install.sh
```

Use a different checkout location with `TERMINAL_CONFIG_REPO`, or a fork with
`TERMINAL_CONFIG_REPO_URL`.

After installation, open a new Ghostty window and authenticate Pi
interactively:

```text
pi
/login
```

Credentials cannot safely be restored from GitHub. The installer also adds the
`terminal` maintenance command to `~/.local/bin`.

## What the installer manages

| Tool | Repository source | Installed location |
| --- | --- | --- |
| Neovim | `nvim/` | `~/.config/nvim` symlink |
| Ghostty | `ghostty/` | `~/.config/ghostty` symlink |
| Starship | `starship/starship.toml` | `~/.config/starship.toml` symlink |
| Zsh | `zsh/` | `~/.zshrc` and `~/.zprofile` symlinks |
| Herdr | `herdr/config.toml` | `~/.config/herdr/config.toml` symlink |
| Pi | `pi/agent/` | selected files copied into `~/.pi/agent/` |
| Shell plugins | upstream Git checkouts | `~/.oh-my-zsh` and `~/.zsh/plugins/` |
| Matt Pocock skills | upstream Git checkout | `~/.pi/agent/skills/matt-pocock` |
| Maintenance CLI | `bin/terminal` | `~/.local/bin/terminal` symlink |

Herdr logs, sockets, and session state remain under `~/.config/herdr` rather
than entering Git. Pi authentication, sessions, trust decisions, package caches,
and Mind Queue state also remain local. Ghostty's plist contains window
positions, updater timestamps, and other macOS application state, so only its
portable text configuration is tracked.

Existing managed paths are backed up with a `.backup-YYYYMMDD-HHMMSS` suffix
before replacement and restored by uninstall when the backup was recorded by
this installer. Re-running the installer is supported.

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

Neovim, Ghostty, Starship, Zsh, and Herdr configuration are symlinked, so
editing their live configuration edits this checkout directly. Review and
commit normally:

```bash
git status
git add nvim ghostty starship zsh herdr bin Brewfile install.sh README.md
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

## Syncing and updating

After the first install, use the maintenance command from any directory:

```bash
terminal sync       # apply config and reconcile dependencies
terminal update     # git pull --ff-only, then sync
terminal upgrade    # update the repo, Homebrew, Pi, and Neovim plugin pins
terminal check      # non-destructive validation
```

`terminal upgrade` can change `nvim/lazy-lock.json`; review and commit intended
lockfile updates. Git checkouts are updated with `--autostash` and are left
intact if local or diverged changes cannot be fast-forwarded.

The equivalent repository commands are `./install.sh --sync`, `--update`,
`--upgrade`, and `--check`.

## Uninstalling

Run the interactive complete cleanup:

```bash
terminal uninstall
```

Use `terminal uninstall --keep-packages` to remove configuration while retaining
Homebrew and global npm packages, or `--yes` for non-interactive use. Uninstall
removes managed links, copied public Pi files, generated integrations,
installer-created checkouts, and (unless retained) packages listed in the
`Brewfile`. It deliberately keeps the Git repository, Homebrew itself,
credentials, sessions, pre-existing checkouts, and backup files so personal data
is not destroyed. Review those and delete them manually if no longer needed.
