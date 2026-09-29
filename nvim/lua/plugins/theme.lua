local function system_background()
  if vim.fn.has("mac") == 1 then
    local dark_mode = vim.trim(vim.fn.system({
      "osascript",
      "-e",
      'tell application "System Events" to tell appearance preferences to get dark mode',
    }))

    if vim.v.shell_error == 0 and (dark_mode == "true" or dark_mode == "false") then
      return dark_mode == "true" and "dark" or "light"
    end

    vim.fn.system({ "defaults", "read", "-g", "AppleInterfaceStyle" })
    return vim.v.shell_error == 0 and "dark" or "light"
  end

  return vim.o.background == "light" and "light" or "dark"
end

local function sync_theme()
  vim.o.background = system_background()
  vim.cmd.colorscheme(vim.o.background == "light" and "tokyonight-day" or "tokyonight-moon")
  vim.notify("Neovim theme synced to system " .. vim.o.background .. " mode")
end

return {
  {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      style = "moon",
      light_style = "day",
    },
    config = function(_, opts)
      require("tokyonight").setup(opts)
      vim.api.nvim_create_user_command("ThemeSync", sync_theme, {
        desc = "Sync Neovim theme with system appearance",
      })
      sync_theme()
    end,
  },
}
