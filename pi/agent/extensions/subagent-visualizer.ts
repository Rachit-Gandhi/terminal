import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const TOOL_NAME = "subagent_status";
const WIDGET_ID = "subagent-visualizer";
const STATUS_ID = "subagents";

type SubagentState = "queued" | "running" | "blocked" | "succeeded" | "failed" | "cancelled";
type SubagentAction = "start" | "update" | "finish" | "reset" | "list";

interface SubagentRecord {
	id: string;
	name: string;
	role?: string;
	task?: string;
	status: SubagentState;
	progress?: number;
	note?: string;
	parentId?: string;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
}

interface SubagentDetails {
	action: SubagentAction;
	agents: SubagentRecord[];
	updatedAgent?: SubagentRecord;
	error?: string;
}

const SubagentParams = Type.Object({
	action: StringEnum(["start", "update", "finish", "reset", "list"] as const, {
		description: "What to do with the visualized subagent/workstream.",
	}),
	id: Type.Optional(Type.String({ description: "Stable short ID for the subagent/workstream, e.g. analyst, reviewer-1, wave-2-api." })),
	name: Type.Optional(Type.String({ description: "Human readable name. Required for action=start unless id is descriptive." })),
	role: Type.Optional(Type.String({ description: "Role/specialty, e.g. Researcher, Developer, Reviewer, QA." })),
	task: Type.Optional(Type.String({ description: "The delegated task or workstream this subagent owns." })),
	status: Type.Optional(StringEnum(["queued", "running", "blocked", "succeeded", "failed", "cancelled"] as const)),
	progress: Type.Optional(Type.Number({ description: "Percent complete from 0 to 100." })),
	note: Type.Optional(Type.String({ description: "Latest short status note or blocker." })),
	parentId: Type.Optional(Type.String({ description: "Optional parent wave/group ID." })),
});

function now() {
	return Date.now();
}

function clampProgress(value: number | undefined): number | undefined {
	if (value === undefined || !Number.isFinite(value)) return undefined;
	return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeId(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

function statusRank(status: SubagentState): number {
	switch (status) {
		case "running": return 0;
		case "blocked": return 1;
		case "queued": return 2;
		case "failed": return 3;
		case "cancelled": return 4;
		case "succeeded": return 5;
	}
}

function statusLabel(status: SubagentState, theme: Theme): string {
	switch (status) {
		case "queued": return theme.fg("dim", "○ queued");
		case "running": return theme.fg("accent", "● running");
		case "blocked": return theme.fg("warning", "◆ blocked");
		case "succeeded": return theme.fg("success", "✓ done");
		case "failed": return theme.fg("error", "✕ failed");
		case "cancelled": return theme.fg("muted", "⊘ cancelled");
	}
}

function plainStatusIcon(status: SubagentState): string {
	switch (status) {
		case "queued": return "○";
		case "running": return "●";
		case "blocked": return "◆";
		case "succeeded": return "✓";
		case "failed": return "✕";
		case "cancelled": return "⊘";
	}
}

function progressBar(progress: number | undefined, width: number, theme: Theme): string {
	if (progress === undefined || width <= 0) return "";
	const filled = Math.round((progress / 100) * width);
	return theme.fg("accent", "█".repeat(filled)) + theme.fg("dim", "░".repeat(Math.max(0, width - filled)));
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	if (minutes < 60) return `${minutes}m${rest ? ` ${rest}s` : ""}`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function renderWidgetLines(agents: SubagentRecord[], width: number, theme: Theme): string[] {
	if (agents.length === 0) return [];

	const counts = new Map<SubagentState, number>();
	for (const agent of agents) counts.set(agent.status, (counts.get(agent.status) ?? 0) + 1);

	const summaryParts = [
		counts.get("running") ? theme.fg("accent", `${counts.get("running")} running`) : undefined,
		counts.get("blocked") ? theme.fg("warning", `${counts.get("blocked")} blocked`) : undefined,
		counts.get("queued") ? theme.fg("dim", `${counts.get("queued")} queued`) : undefined,
		counts.get("succeeded") ? theme.fg("success", `${counts.get("succeeded")} done`) : undefined,
		counts.get("failed") ? theme.fg("error", `${counts.get("failed")} failed`) : undefined,
		counts.get("cancelled") ? theme.fg("muted", `${counts.get("cancelled")} cancelled`) : undefined,
	].filter(Boolean) as string[];

	const lines = [
		truncateToWidth(`${theme.fg("accent", theme.bold("Subagents"))} ${theme.fg("dim", "·")} ${summaryParts.join(theme.fg("dim", " · "))}`, width),
	];

	const sorted = [...agents].sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.updatedAt - a.updatedAt);
	const visible = sorted.slice(0, 8);
	for (const agent of visible) {
		const age = agent.finishedAt ? formatDuration(agent.finishedAt - agent.startedAt) : formatDuration(now() - agent.startedAt);
		const title = `${agent.name}${agent.role ? ` (${agent.role})` : ""}`;
		const percent = agent.progress === undefined ? "" : ` ${agent.progress}%`;
		const bar = progressBar(agent.progress, 8, theme);
		const note = agent.note || agent.task || "";
		lines.push(truncateToWidth(`  ${statusLabel(agent.status, theme)} ${theme.fg("muted", agent.id)} ${theme.fg("text", title)}${percent ? theme.fg("dim", percent) : ""} ${bar} ${theme.fg("dim", age)}${note ? theme.fg("dim", ` — ${note}`) : ""}`, width));
	}
	if (sorted.length > visible.length) {
		lines.push(truncateToWidth(`  ${theme.fg("dim", `… ${sorted.length - visible.length} more. Use /subagents to list all.`)}`, width));
	}
	return lines;
}

function summarizeForModel(agents: SubagentRecord[]): string {
	if (agents.length === 0) return "No subagents are being tracked.";
	return agents
		.sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.updatedAt - a.updatedAt)
		.map((agent) => {
			const pct = agent.progress === undefined ? "" : ` ${agent.progress}%`;
			const role = agent.role ? ` (${agent.role})` : "";
			const note = agent.note ? ` — ${agent.note}` : agent.task ? ` — ${agent.task}` : "";
			return `${plainStatusIcon(agent.status)} ${agent.id}: ${agent.name}${role} [${agent.status}${pct}]${note}`;
		})
		.join("\n");
}

export default function subagentVisualizer(pi: ExtensionAPI) {
	let agents = new Map<string, SubagentRecord>();
	let nextId = 1;
	let widgetVisible = true;
	let lastCtx: ExtensionContext | undefined;

	function snapshot(): SubagentRecord[] {
		return [...agents.values()].map((agent) => ({ ...agent }));
	}

	function setFromSnapshot(next: SubagentRecord[]) {
		agents = new Map(next.map((agent) => [agent.id, { ...agent }]));
		const numericIds = next
			.map((agent) => /^agent-(\d+)$/.exec(agent.id)?.[1])
			.filter((value): value is string => Boolean(value))
			.map(Number);
		nextId = numericIds.length ? Math.max(...numericIds) + 1 : nextId;
	}

	function updateUi(ctx: ExtensionContext | undefined = lastCtx) {
		if (!ctx?.hasUI) return;
		lastCtx = ctx;
		const current = snapshot();
		const running = current.filter((agent) => agent.status === "running").length;
		const blocked = current.filter((agent) => agent.status === "blocked").length;
		const failed = current.filter((agent) => agent.status === "failed").length;
		const done = current.filter((agent) => agent.status === "succeeded").length;

		if (current.length === 0) {
			ctx.ui.setStatus(STATUS_ID, undefined);
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		const theme = ctx.ui.theme;
		const bits = [
			running ? theme.fg("accent", `${running}r`) : undefined,
			blocked ? theme.fg("warning", `${blocked}b`) : undefined,
			failed ? theme.fg("error", `${failed}f`) : undefined,
			done ? theme.fg("success", `${done}✓`) : undefined,
		].filter(Boolean).join(theme.fg("dim", "/"));
		ctx.ui.setStatus(STATUS_ID, `${theme.fg("accent", "🤖")} ${bits || theme.fg("dim", `${current.length}`)}`);

		if (!widgetVisible) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
			render: (width: number) => renderWidgetLines(snapshot(), width, theme),
			invalidate: () => {},
		}));
	}

	function reconstructState(ctx: ExtensionContext) {
		lastCtx = ctx;
		agents = new Map();
		nextId = 1;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const message = entry.message;
			if (message.role !== "toolResult" || message.toolName !== TOOL_NAME) continue;
			const details = message.details as SubagentDetails | undefined;
			if (details?.agents) setFromSnapshot(details.agents);
		}
		updateUi(ctx);
	}

	function applyAction(params: any): { details: SubagentDetails; text: string } {
		const action = params.action as SubagentAction;
		if (action === "reset") {
			const count = agents.size;
			agents.clear();
			nextId = 1;
			return { details: { action, agents: [] }, text: `Reset subagent visualizer (${count} cleared).` };
		}

		if (action === "list") {
			const current = snapshot();
			return { details: { action, agents: current }, text: summarizeForModel(current) };
		}

		const id = normalizeId(params.id || params.name || `agent-${nextId++}`) || `agent-${nextId++}`;
		const existing = agents.get(id);
		const timestamp = now();

		if (action === "start") {
			const agent: SubagentRecord = {
				id,
				name: params.name || existing?.name || id,
				role: params.role ?? existing?.role,
				task: params.task ?? existing?.task,
				status: (params.status as SubagentState | undefined) ?? "running",
				progress: clampProgress(params.progress) ?? existing?.progress,
				note: params.note,
				parentId: params.parentId ?? existing?.parentId,
				startedAt: existing?.startedAt ?? timestamp,
				updatedAt: timestamp,
			};
			agents.set(id, agent);
			return { details: { action, agents: snapshot(), updatedAgent: agent }, text: `Started ${agent.name} (${agent.id}).` };
		}

		if (!existing) {
			const current = snapshot();
			return {
				details: { action, agents: current, error: `Unknown subagent id: ${id}` },
				text: `Unknown subagent id: ${id}. Start it first with action=start.`,
			};
		}

		const nextStatus = (params.status as SubagentState | undefined) ?? (action === "finish" ? "succeeded" : existing.status);
		const updated: SubagentRecord = {
			...existing,
			name: params.name ?? existing.name,
			role: params.role ?? existing.role,
			task: params.task ?? existing.task,
			status: nextStatus,
			progress: clampProgress(params.progress) ?? (action === "finish" && nextStatus === "succeeded" ? 100 : existing.progress),
			note: params.note ?? existing.note,
			parentId: params.parentId ?? existing.parentId,
			updatedAt: timestamp,
			finishedAt: action === "finish" || ["succeeded", "failed", "cancelled"].includes(nextStatus) ? timestamp : existing.finishedAt,
		};
		agents.set(id, updated);
		return { details: { action, agents: snapshot(), updatedAgent: updated }, text: `${action === "finish" ? "Finished" : "Updated"} ${updated.name} (${updated.id}) as ${updated.status}.` };
	}

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_ID, undefined);
		ctx.ui.setWidget(WIDGET_ID, undefined);
		lastCtx = undefined;
	});

	pi.events.on("subagent:status", (payload) => {
		try {
			applyAction(payload);
			updateUi();
		} catch {
			// Ignore malformed cross-extension events. The typed tool is the reliable path.
		}
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "Subagent Status",
		description: "Visualize delegated subagents/workstreams in the Pi TUI. Actions: start, update, finish, reset, list.",
		promptSnippet: "Track delegated subagents/workstreams in a live TUI widget.",
		promptGuidelines: [
			"Use subagent_status whenever coordinating multiple roles, waves, or delegated workstreams so the user can see what each subagent is doing.",
			"Call subagent_status with action=start before a delegated workstream, action=update for progress/blockers, and action=finish with status=succeeded/failed/cancelled when it ends.",
			"Use stable subagent_status ids so later updates modify the same displayed row.",
		],
		parameters: SubagentParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = applyAction(params);
			updateUi(ctx);
			return {
				content: [{ type: "text", text: result.text }],
				details: result.details,
			};
		},

		renderCall(args, theme) {
			const id = args.id || args.name || "";
			let text = theme.fg("toolTitle", theme.bold(`${TOOL_NAME} `)) + theme.fg("muted", args.action || "update");
			if (id) text += ` ${theme.fg("accent", String(id))}`;
			if (args.status) text += ` ${theme.fg("dim", String(args.status))}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as SubagentDetails | undefined;
			if (details?.error) return new Text(theme.fg("error", details.error), 0, 0);
			if (details?.updatedAgent) {
				const agent = details.updatedAgent;
				return new Text(`${statusLabel(agent.status, theme)} ${theme.fg("accent", agent.id)} ${theme.fg("muted", agent.name)}${agent.note ? theme.fg("dim", ` — ${agent.note}`) : ""}`, 0, 0);
			}
			const first = result.content[0];
			return new Text(first?.type === "text" ? first.text : "", 0, 0);
		},
	});

	pi.registerCommand("subagents", {
		description: "Show, hide, list, or clear the subagent visualizer widget",
		handler: async (args, ctx) => {
			lastCtx = ctx;
			const arg = (args || "").trim().toLowerCase();
			if (arg === "clear" || arg === "reset") {
				agents.clear();
				nextId = 1;
				updateUi(ctx);
				ctx.ui.notify("Subagent visualizer cleared.", "info");
				return;
			}
			if (arg === "hide") {
				widgetVisible = false;
				updateUi(ctx);
				ctx.ui.notify("Subagent widget hidden. Use /subagents show to restore.", "info");
				return;
			}
			if (arg === "show" || arg === "") {
				widgetVisible = true;
				updateUi(ctx);
			}

			const text = summarizeForModel(snapshot());
			ctx.ui.notify(text.split("\n").slice(0, 8).join("\n"), "info");
		},
	});
}
