import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_URL = "https://github.com/mattpocock/skills.git";
const PI_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`;
const INSTALL_DIR = process.env.MATT_POCOCK_SKILLS_DIR || join(PI_AGENT_DIR, "skills", "matt-pocock");

type Mode = "install" | "soft-resync" | "hard-resync" | "status";

const syncSchema = Type.Object({
	mode: Type.String({
		enum: ["install", "soft-resync", "hard-resync", "status"],
		description: "install clones if missing and otherwise soft-resyncs; soft-resync preserves local changes with git pull --autostash; hard-resync discards local changes and resets to origin/HEAD; status reports current state.",
	}),
});

type SyncParams = { mode: Mode };

async function runGit(args: string[], cwd?: string) {
	const result = await execFileAsync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

async function hasGitRepo(path: string) {
	return existsSync(join(path, ".git"));
}

async function getOriginHead() {
	try {
		const symbolic = await runGit(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], INSTALL_DIR);
		if (symbolic) return symbolic;
	} catch {
		// Fall through to common branch names.
	}
	for (const branch of ["origin/main", "origin/master"]) {
		try {
			await runGit(["rev-parse", "--verify", branch], INSTALL_DIR);
			return branch;
		} catch {
			// Try next.
		}
	}
	return "origin/main";
}

async function countSkillFiles(dir: string): Promise<number> {
	let count = 0;
	async function walk(current: string) {
		let entries: Awaited<ReturnType<typeof readdir>>;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			const full = join(current, entry.name);
			if (entry.isDirectory()) await walk(full);
			else if (entry.isFile() && entry.name === "SKILL.md") count++;
		}
	}
	await walk(dir);
	return count;
}

async function statusText() {
	if (!existsSync(INSTALL_DIR)) {
		return `Matt Pocock skills are not installed. Target: ${INSTALL_DIR}`;
	}

	const repo = await hasGitRepo(INSTALL_DIR);
	if (!repo) {
		return `Target exists but is not a git checkout: ${INSTALL_DIR}`;
	}

	const [head, branch, dirty, skillCount] = await Promise.all([
		runGit(["rev-parse", "--short", "HEAD"], INSTALL_DIR).catch(() => "unknown"),
		runGit(["branch", "--show-current"], INSTALL_DIR).catch(() => "unknown"),
		runGit(["status", "--porcelain"], INSTALL_DIR).catch(() => "unknown"),
		countSkillFiles(INSTALL_DIR),
	]);

	return [
		`Matt Pocock skills installed at: ${INSTALL_DIR}`,
		`Repo: ${REPO_URL}`,
		`Branch: ${branch || "detached"}`,
		`HEAD: ${head}`,
		`Skills discovered: ${skillCount}`,
		`Working tree: ${dirty ? "dirty" : "clean"}`,
	].join("\n");
}

async function cloneFresh() {
	await mkdir(join(INSTALL_DIR, ".."), { recursive: true });
	await runGit(["clone", REPO_URL, INSTALL_DIR]);
}

async function softResync() {
	if (!existsSync(INSTALL_DIR)) {
		await cloneFresh();
		return "Cloned Matt Pocock skills.";
	}

	if (!(await hasGitRepo(INSTALL_DIR))) {
		throw new Error(`Target exists but is not a git checkout: ${INSTALL_DIR}. Run hard-resync to replace it.`);
	}

	await runGit(["fetch", "--prune", "origin"], INSTALL_DIR);
	await runGit(["pull", "--ff-only", "--autostash"], INSTALL_DIR);
	return "Soft-resynced Matt Pocock skills (preserved local changes with git autostash).";
}

async function hardResync() {
	if (!existsSync(INSTALL_DIR)) {
		await cloneFresh();
		return "Cloned Matt Pocock skills.";
	}

	let isDirectory = false;
	try {
		isDirectory = (await stat(INSTALL_DIR)).isDirectory();
	} catch {
		isDirectory = false;
	}

	if (!isDirectory || !(await hasGitRepo(INSTALL_DIR))) {
		await rm(INSTALL_DIR, { recursive: true, force: true });
		await cloneFresh();
		return "Replaced non-git target with a fresh Matt Pocock skills checkout.";
	}

	await runGit(["fetch", "--prune", "origin"], INSTALL_DIR);
	const originHead = await getOriginHead();
	await runGit(["reset", "--hard", originHead], INSTALL_DIR);
	await runGit(["clean", "-fdx"], INSTALL_DIR);
	return `Hard-resynced Matt Pocock skills to ${originHead} (discarded local checkout changes).`;
}

async function sync(mode: Mode) {
	if (mode === "status") return statusText();
	const action = mode === "hard-resync" ? await hardResync() : await softResync();
	const summary = await statusText();
	return `${action}\n\n${summary}`;
}

function parseMode(args: string | undefined): Mode | undefined {
	const first = (args || "").trim().split(/\s+/).filter(Boolean)[0] as Mode | undefined;
	if (!first) return undefined;
	if (["install", "soft-resync", "hard-resync", "status"].includes(first)) return first;
	return undefined;
}

export default function mattPocockSkills(pi: ExtensionAPI) {
	pi.registerCommand("matt-pocock-skills", {
		description: "Install or resync Matt Pocock's latest skills globally for pi",
		handler: async (args, ctx) => {
			let mode = parseMode(args);
			if (!mode && ctx.hasUI) {
				if (existsSync(INSTALL_DIR)) {
					mode = (await ctx.ui.select("Matt Pocock skills", ["soft-resync", "hard-resync", "status"])) as Mode | undefined;
				} else {
					mode = (await ctx.ui.select("Matt Pocock skills", ["install", "status"])) as Mode | undefined;
				}
			}
			mode ||= existsSync(INSTALL_DIR) ? "soft-resync" : "install";

			if (mode === "hard-resync" && ctx.hasUI) {
				const ok = await ctx.ui.confirm(
					"Hard-resync Matt Pocock skills?",
					`This will discard local changes in ${INSTALL_DIR}. Continue?`,
				);
				if (!ok) return;
			}

			try {
				const result = await sync(mode);
				ctx.ui.notify(result, "info");
				if (mode !== "status") {
					ctx.ui.notify("Reloading pi so the global skills are available now...", "info");
					await ctx.reload();
					return;
				}
			} catch (error) {
				ctx.ui.notify(`Matt Pocock skills sync failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.registerCommand("matt-pocock-skills-reload", {
		description: "Reload pi after Matt Pocock skills were installed or resynced",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Reloading pi so Matt Pocock skills are available...", "info");
			await ctx.reload();
			return;
		},
	});

	pi.registerTool({
		name: "matt_pocock_skills_sync",
		label: "Matt Pocock Skills Sync",
		description: "Install, soft-resync, hard-resync, or report status for Matt Pocock's skills in pi's global skills directory.",
		promptSnippet: "Install or resync Matt Pocock's global pi skills checkout",
		promptGuidelines: [
			"Use matt_pocock_skills_sync when the user asks to install, update, hard-resync, soft-resync, or inspect Matt Pocock's skills for pi.",
			"Prefer matt_pocock_skills_sync mode=soft-resync for normal updates; use hard-resync only when the user explicitly asks to discard local checkout changes.",
		],
		parameters: syncSchema,
		async execute(_toolCallId, params: SyncParams) {
			const result = await sync(params.mode);
			if (params.mode !== "status") {
				pi.sendUserMessage("/matt-pocock-skills-reload", { deliverAs: "followUp" });
			}
			return {
				content: [{ type: "text", text: result }],
				details: { mode: params.mode, installDir: INSTALL_DIR, repoUrl: REPO_URL },
			};
		},
	});
}
