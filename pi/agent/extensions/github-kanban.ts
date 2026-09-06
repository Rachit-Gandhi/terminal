import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_OUTPUT = `${process.env.HOME}/github-assigned-issues-kanban.html`;
const GITHUB_API = process.env.GITHUB_API_URL || "https://api.github.com";

type GitHubLabel = { name: string; color?: string };
type GitHubUser = { login: string; html_url?: string };
type GitHubIssue = {
	number: number;
	title: string;
	state: "open" | "closed";
	html_url: string;
	updated_at: string;
	created_at: string;
	closed_at?: string | null;
	repository_url: string;
	labels: GitHubLabel[];
	assignees?: GitHubUser[];
	user?: GitHubUser;
	pull_request?: unknown;
};

type GitHubSearchResponse = { items: GitHubIssue[]; total_count: number };

type Card = GitHubIssue & { repo: string; column: ColumnId };
type ColumnId = "todo" | "inProgress" | "review" | "blocked" | "done";

const columns: Array<{ id: ColumnId; title: string; hint: string }> = [
	{ id: "todo", title: "To do", hint: "Open assigned issues" },
	{ id: "inProgress", title: "In progress", hint: "Labels: in progress / doing / started" },
	{ id: "review", title: "Review", hint: "Labels: review / qa / testing" },
	{ id: "blocked", title: "Blocked", hint: "Labels: blocked / waiting / on hold" },
	{ id: "done", title: "Done", hint: "Drop cards here to keep them done until GitHub activity changes" },
];

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getToken(): string | undefined {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
	try {
		return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
	} catch {
		return undefined;
	}
}

function repoName(issue: GitHubIssue): string {
	return issue.repository_url.replace(`${GITHUB_API}/repos/`, "");
}

function labelNames(issue: GitHubIssue): string[] {
	return issue.labels.map((label) => label.name.toLowerCase());
}

function hasAny(labels: string[], words: string[]): boolean {
	return labels.some((label) => words.some((word) => label.includes(word)));
}

function classify(issue: GitHubIssue): ColumnId {
	if (issue.state === "closed") return "done";
	const labels = labelNames(issue);
	if (hasAny(labels, ["blocked", "waiting", "on hold", "stuck"])) return "blocked";
	if (hasAny(labels, ["review", "qa", "test", "testing", "verify"])) return "review";
	if (hasAny(labels, ["in progress", "in-progress", "doing", "wip", "started", "active"])) return "inProgress";
	return "todo";
}

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function fmtDate(value: string | null | undefined): string {
	if (!value) return "";
	return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function githubGet<T>(path: string, token: string): Promise<T> {
	const response = await fetch(`${GITHUB_API}${path}`, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "pi-github-kanban-extension",
		},
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`GitHub API ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
	}
	return (await response.json()) as T;
}

async function fetchAssignedIssues(token: string): Promise<Card[]> {
	const all: GitHubIssue[] = [];
	const query = encodeURIComponent("is:issue is:open assignee:@me archived:false");
	for (let page = 1; page <= 10; page++) {
		const result = await githubGet<GitHubSearchResponse>(`/search/issues?q=${query}&sort=updated&order=desc&per_page=100&page=${page}`, token);
		all.push(...result.items);
		if (result.items.length < 100) break;
	}
	return all
		.filter((issue) => !issue.pull_request && issue.state === "open")
		.map((issue) => ({ ...issue, repo: repoName(issue), column: classify(issue) }))
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function renderCard(issue: Card): string {
	const labels = issue.labels
		.map((label) => `<span class="label" style="--label-color:#${escapeHtml(label.color || "6e7781")}">${escapeHtml(label.name)}</span>`)
		.join("");
	const assignees = issue.assignees?.map((user) => escapeHtml(user.login)).join(", ") || "";
	const issueId = `${issue.repo}#${issue.number}`;
	return `<article class="card" draggable="true" data-id="${escapeHtml(issueId)}" data-updated="${escapeHtml(issue.updated_at)}" data-default-column="${issue.column}" data-repo="${escapeHtml(issue.repo)}" data-title="${escapeHtml(issue.title)}" data-labels="${escapeHtml(issue.labels.map((l) => l.name).join(" "))}">
		<a class="card-title" draggable="false" href="${escapeHtml(issue.html_url)}">${escapeHtml(issue.title)}</a>
		<div class="meta"><strong>${escapeHtml(issue.repo)}#${issue.number}</strong></div>
		<div class="labels">${labels}</div>
		<div class="meta">Updated ${escapeHtml(fmtDate(issue.updated_at))}${issue.closed_at ? ` · Closed ${escapeHtml(fmtDate(issue.closed_at))}` : ""}</div>
		${assignees ? `<div class="meta">Assigned: ${assignees}</div>` : ""}
	</article>`;
}

function renderHtml(cards: Card[]): string {
	const generatedAt = new Date();
	const totalOpen = cards.filter((issue) => issue.state === "open").length;
	const byColumn = new Map<ColumnId, Card[]>();
	for (const column of columns) byColumn.set(column.id, []);
	for (const card of cards) byColumn.get(card.column)?.push(card);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GitHub Assigned Issues Kanban</title>
<style>
:root { color-scheme: light dark; --bg:#0d1117; --panel:#161b22; --card:#21262d; --text:#e6edf3; --muted:#8b949e; --border:#30363d; --accent:#2f81f7; }
* { box-sizing: border-box; } body { margin:0; font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
header { position:sticky; top:0; z-index:2; padding:18px 22px; border-bottom:1px solid var(--border); background:rgba(13,17,23,.94); backdrop-filter: blur(8px); }
h1 { margin:0 0 8px; font-size:22px; } .summary { color:var(--muted); display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
.search { margin-top:12px; width:min(520px,100%); padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--panel); color:var(--text); }
.board { display:grid; grid-template-columns: repeat(5, minmax(260px, 1fr)); gap:14px; padding:18px; align-items:start; min-width:1320px; }
.column { background:var(--panel); border:1px solid var(--border); border-radius:14px; min-height:70vh; overflow:hidden; }
.column-head { padding:12px 12px 10px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:8px; align-items:start; }
.column-title { font-weight:700; } .hint { color:var(--muted); font-size:12px; margin-top:2px; } .count { color:var(--muted); font-variant-numeric: tabular-nums; }
.cards { padding:10px; display:flex; flex-direction:column; gap:10px; min-height:64vh; }
.column.drag-over { outline:2px solid var(--accent); outline-offset:-4px; }
.card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:12px; box-shadow: 0 1px 0 rgba(255,255,255,.03) inset; cursor:grab; }
.card:active { cursor:grabbing; } .card.dragging { opacity:.45; }
.card-title { color:var(--text); text-decoration:none; font-weight:650; } .card-title:hover { color:var(--accent); text-decoration:underline; }
.meta { color:var(--muted); font-size:12px; margin-top:8px; overflow-wrap:anywhere; }
.labels { display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; }
.label { border:1px solid color-mix(in srgb, var(--label-color), white 20%); background:color-mix(in srgb, var(--label-color), transparent 72%); color:var(--text); border-radius:999px; padding:2px 7px; font-size:11px; }
.empty { color:var(--muted); padding:14px; }
@media (max-width: 900px) { .board { display:flex; overflow-x:auto; min-width:0; } .column { min-width:300px; } }
</style>
</head>
<body>
<header>
	<h1>GitHub Assigned Issues Kanban</h1>
	<div class="summary"><span>${cards.length} open issues</span><span>${totalOpen} synced</span><span>Closed issues are not synced</span><span>Generated ${escapeHtml(fmtDate(generatedAt.toISOString()))}</span><span>Refresh by running <code>/github-kanban</code> again in pi.</span></div>
	<input id="search" class="search" placeholder="Filter by title, repo, or label..." />
</header>
<main class="board">
${columns.map((column) => {
	const items = byColumn.get(column.id) || [];
	return `<section class="column" data-column="${column.id}"><div class="column-head"><div><div class="column-title">${escapeHtml(column.title)}</div><div class="hint">${escapeHtml(column.hint)}</div></div><div class="count">${items.length}</div></div><div class="cards">${items.map(renderCard).join("\n")}<div class="empty">No issues</div></div></section>`;
}).join("\n")}
</main>
<script>
const STORAGE_KEY = 'pi.githubKanban.cardState.v1';
const input = document.getElementById('search');
const state = loadState();
let dragged = null;

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function columnFor(id) { return document.querySelector('.column[data-column="' + CSS.escape(id) + '"] .cards'); }
function columnIdFor(card) { return card.closest('.column')?.dataset.column || card.dataset.defaultColumn; }
function updateCounts() {
  for (const column of document.querySelectorAll('.column')) {
    const visibleCards = [...column.querySelectorAll('.card')].filter((card) => card.style.display !== 'none');
    column.querySelector('.count').textContent = String(visibleCards.length);
    column.querySelector('.empty').style.display = visibleCards.length ? 'none' : '';
  }
}
function applyFilter() {
  const q = input.value.toLowerCase().trim();
  for (const card of document.querySelectorAll('.card')) {
    const text = [card.dataset.repo, card.dataset.title, card.dataset.labels].join(' ').toLowerCase();
    card.style.display = !q || text.includes(q) ? '' : 'none';
  }
  updateCounts();
}
function remember(card, columnId) {
  const id = card.dataset.id;
  if (columnId === card.dataset.defaultColumn) delete state[id];
  else state[id] = { column: columnId, updatedAt: card.dataset.updated, savedAt: new Date().toISOString() };
  saveState();
}

for (const card of document.querySelectorAll('.card')) {
  const saved = state[card.dataset.id];
  if (saved?.column) {
    if (saved.column === 'done' && saved.updatedAt !== card.dataset.updated) {
      // New GitHub activity on a locally-done issue: sync it back onto the active board.
      delete state[card.dataset.id];
      saveState();
    } else {
      columnFor(saved.column)?.prepend(card);
    }
  }
  card.addEventListener('dragstart', (event) => {
    dragged = card;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.id);
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragged = null;
    for (const column of document.querySelectorAll('.column')) column.classList.remove('drag-over');
  });
}

for (const column of document.querySelectorAll('.column')) {
  column.addEventListener('dragover', (event) => { event.preventDefault(); column.classList.add('drag-over'); });
  column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
  column.addEventListener('drop', (event) => {
    event.preventDefault();
    column.classList.remove('drag-over');
    const card = dragged || document.querySelector('[data-id="' + CSS.escape(event.dataTransfer.getData('text/plain')) + '"]');
    if (!card) return;
    column.querySelector('.cards').prepend(card);
    remember(card, column.dataset.column);
    applyFilter();
  });
}

input.addEventListener('input', applyFilter);
applyFilter();
</script>
</body>
</html>`;
}

async function buildKanban(outputPath: string): Promise<{ outputPath: string; count: number }> {
	const token = getToken();
	if (!token) throw new Error("No GitHub token found. Run `gh auth login`, or set GITHUB_TOKEN/GH_TOKEN.");
	const cards = await fetchAssignedIssues(token);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, renderHtml(cards), "utf8");
	return { outputPath, count: cards.length };
}

export default function githubKanban(pi: ExtensionAPI) {
	pi.registerCommand("github-kanban", {
		description: "Refresh an HTML Kanban board of your GitHub assigned issues",
		handler: async (args, ctx) => {
			const parts = (args || "").trim().split(/\s+/).filter(Boolean);
			const shouldOpen = !parts.includes("--no-open");
			const customPath = parts.find((part) => !part.startsWith("--"));
			const outputPath = customPath
				? resolve(ctx.cwd, customPath)
				: resolve(process.env.GITHUB_KANBAN_PATH || DEFAULT_OUTPUT);
			ctx.ui.notify("Refreshing GitHub assigned issues Kanban...", "info");
			try {
				const result = await buildKanban(outputPath);
				if (shouldOpen) {
					try { execFileSync("open", [result.outputPath], { stdio: "ignore" }); } catch {}
				}
				ctx.ui.notify(`GitHub Kanban refreshed: ${result.count} issues → ${result.outputPath}`, "info");
			} catch (error) {
				ctx.ui.notify(`GitHub Kanban refresh failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}
