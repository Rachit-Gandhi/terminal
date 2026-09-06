return {
  {
    "brianhuster/live-preview.nvim",
    cmd = { "LivePreview" },
    ft = { "markdown" },
    dependencies = { "folke/snacks.nvim" },
    opts = {
      picker = "snacks.picker",
      dynamic_root = true,
      sync_scroll = true,
    },
    config = function(_, opts)
      require("livepreview.config").set(opts)
    end,
  },
}
