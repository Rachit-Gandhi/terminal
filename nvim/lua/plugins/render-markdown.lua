return {
  {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = { "markdown" },
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
      "nvim-mini/mini.icons",
    },
    keys = {
      {
        "<leader>mr",
        "<cmd>RenderMarkdown buf_toggle<cr>",
        ft = "markdown",
        desc = "Toggle inline markdown rendering",
      },
    },
    opts = {
      -- Keep completed lines rendered while editing; the cursor line stays raw.
      render_modes = true,
    },
  },
}
