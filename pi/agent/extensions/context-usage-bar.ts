import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

function formatTokens(tokens: number): string {
	if (tokens < 1000) return `${tokens}`;
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
	return `${(tokens / 1_000_000).toFixed(1)}M`;
}

function renderBar(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	const theme = ctx.ui.theme;

	if (!usage || !contextWindow || usage.percent === null) {
		return theme.fg("dim", "ctx [??????????] ?");
	}

	const percent = Math.max(0, Math.min(100, usage.percent));
	const filled = Math.round(percent / 10);
	const bar = "█".repeat(filled) + "░".repeat(10 - filled);
	const color = percent >= 90 ? "error" : percent >= 70 ? "warning" : "accent";

	return theme.fg(color, `ctx [${bar}] ${Math.round(percent)}%`) +
		theme.fg("dim", ` (${formatTokens(usage.tokens)}/${formatTokens(contextWindow)})`);
}

export default function (pi: ExtensionAPI) {
	const update = (ctx: ExtensionContext) => {
		ctx.ui.setStatus("context-usage-bar", renderBar(ctx));
	};

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setFooter((tui, _theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const statuses = [...footerData.getExtensionStatuses().values()];
					return statuses.length > 0 ? [truncateToWidth(statuses.join(" "), width)] : [];
				},
			};
		});
		update(ctx);
	});
	pi.on("model_select", (_event, ctx) => update(ctx));
	pi.on("message_update", (_event, ctx) => update(ctx));
	pi.on("message_end", (_event, ctx) => update(ctx));
	pi.on("session_compact", (_event, ctx) => update(ctx));
	pi.on("session_shutdown", (_event, ctx) => ctx.ui.setStatus("context-usage-bar", undefined));
}
