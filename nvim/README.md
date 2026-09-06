# Neovim configuration

Reliable, portable Neovim configuration based on LazyVim.

## Install or repair

From this directory:

```sh
./install.sh
```

The installer:

1. Checks that Neovim is available.
2. Backs up an existing `~/.config/nvim` when needed.
3. Symlinks this checkout as `~/.config/nvim`.
4. Synchronizes the pinned plugins in `lazy-lock.json`.
5. Loads the configuration headlessly and verifies the Markdown preview command.

Run the non-mutating health check with:

```sh
./install.sh --check
```

## Updating safely

```sh
nvim
:Lazy update
./install.sh --check
git diff
```

Commit `lazy-lock.json` whenever plugin versions change. Keep secrets, machine-local state, and Neovim cache files out of this repository.

## Markdown preview

Markdown renders inline automatically while editing. The cursor line remains raw
so its syntax can be edited; after moving to another line, headings, lists, code
blocks, tables, and other elements are rendered in the buffer.

- `<leader>mr` or `:RenderMarkdown buf_toggle` — toggle inline rendering
- `<leader>mp` or `:LivePreview start` — open browser preview
- `<leader>mc` or `:LivePreview close` — close browser preview

The optional browser preview supports Mermaid diagrams and updates live while editing.

## Java development

Open Neovim from a Maven or Gradle project root. The Java setup provides
completion, diagnostics, navigation, refactoring, import organization, Google
Java Format, JUnit test execution, and debugging through `jdtls`.

- `<leader>co` — organize imports
- `<leader>ca` — code actions and refactorings
- `<leader>tt` — run the current Java test class
- `<leader>tr` — run the nearest Java test
- `<leader>db` — toggle a breakpoint
- `<leader>dc` — run or continue the debugger
- `<leader>du` — toggle the debugger UI

Use `:LspInfo` to inspect the language server and `:Mason` to inspect installed
Java tooling. Prefer a project's `./mvnw` or `./gradlew` wrapper when present;
the bootstrap also installs global Maven and Gradle commands.

## System theme

Neovim uses the same Catppuccin pair as Ghostty: Mocha in dark mode and Latte
in light mode. The appearance is detected on startup. Run `:ThemeSync` or press
`<leader>uT` after changing the macOS appearance without restarting Neovim.
