local map = vim.keymap.set

map("n", "<leader>e", "<cmd>lua Snacks.explorer()<cr>", { desc = "Explorer" })
map("n", "<leader>t", "<cmd>lua Snacks.terminal()<cr>", { desc = "Terminal" })
map("n", "<leader>mp", "<cmd>LivePreview start<cr>", { desc = "Markdown preview" })
map("n", "<leader>uT", "<cmd>ThemeSync<cr>", { desc = "Sync system theme" })
map("n", "<leader>mc", "<cmd>LivePreview close<cr>", { desc = "Close markdown preview" })
map("n", "<leader>ta", function()
  vim.ui.select({ "claude", "pi", "herdr" }, { prompt = "Start agent" }, function(choice)
    if choice then Snacks.terminal(choice) end
  end)
end, { desc = "Agent terminal" })
map("t", "<esc><esc>", [[<C-\\><C-n>]], { desc = "Normal mode" })
