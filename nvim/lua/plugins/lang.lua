return {
  { "mason-org/mason.nvim", opts = { ensure_installed = {
    "gopls", "golangci-lint", "goimports", "delve",
    "vtsls", "eslint-lsp", "prettierd",
    "basedpyright", "ruff", "debugpy",
    "jdtls", "java-debug-adapter", "java-test", "google-java-format",
  } } },

  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        gopls = { settings = { gopls = { gofumpt = true, staticcheck = true } } },
        basedpyright = { settings = { basedpyright = { analysis = { typeCheckingMode = "standard" } } } },
        ruff = {},
      },
    },
  },
  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        go = { "goimports", "gofumpt" },
        javascript = { "prettierd" }, javascriptreact = { "prettierd" },
        typescript = { "prettierd" }, typescriptreact = { "prettierd" },
        python = { "ruff_format", "ruff_organize_imports" },
        java = { "google-java-format" },
      },
    },
  },
}
