---
name: orchestrate-subagents
description: Coordinate multi-agent or multi-workstream coding tasks and keep subagent progress visible in Pi. Use when the user asks for orchestration, subagents, swarms, parallel workstreams, waves, BMAD-style pipelines, or wants one agent to delegate to specialist roles.
---

# Orchestrate Subagents

Use this skill to run a structured multi-workstream session without hiding progress from the user.

## Default Pattern

1. Decide whether the task needs orchestration.
   - For small tasks, do not invent a swarm. Use 1-3 lightweight roles only if they reduce risk.
   - For large tasks, split into named workstreams with clear ownership and exit criteria.
2. Make the work visible with the `subagent_status` tool.
   - Call `subagent_status` with `action: "start"` before each workstream begins.
   - Use stable IDs like `research`, `api-dev`, `ui-dev`, `reviewer`, `qa`.
   - Call `action: "update"` when progress, blockers, or scope changes.
   - Call `action: "finish"` with `status: "succeeded" | "failed" | "cancelled"` when complete.
3. Run in waves:
   - Discovery/research: read-only investigation, constraints, risks.
   - Plan: interfaces, files, test strategy, sequencing.
   - Implementation: one or more independent workstreams.
   - Review: correctness, standards, security, regressions.
   - Close: tests, summary, carryover.
4. Gate between waves. Do not start the next wave if a blocker would invalidate it.
5. Keep handoffs explicit: each workstream reports files touched, decisions made, risks, and next steps.

## Pi-Specific Guidance

Pi does not ship native subagents by default. Prefer one of these approaches:

- **Simulated specialist roles in one Pi session** for most tasks. Use `subagent_status` so the user can see the logical agents.
- **Separate Pi/tmux sessions** only when actual parallel execution is worth the cost and coordination overhead. Ask the user before spawning extra model sessions.
- **Session Orchestrator package** for a full lifecycle loop. Research notes in `~/.pi/agent/research/subagent-orchestrators-2026-07-05.md` currently recommend `Kanevry/session-orchestrator` as the best Pi-compatible orchestrator to review/install.

## Required Visibility Contract

When coordinating more than one role/workstream, always maintain the visualizer:

```json
{ "action": "start", "id": "research", "name": "Research", "role": "Researcher", "task": "Map existing code and risks", "status": "running", "progress": 0 }
```

```json
{ "action": "update", "id": "research", "progress": 60, "note": "Found auth boundary and test fixtures" }
```

```json
{ "action": "finish", "id": "research", "status": "succeeded", "progress": 100, "note": "Ready for implementation wave" }
```

If a workstream blocks, set `status: "blocked"` and explain the blocker in `note`.

## Output Shape

When reporting to the user, summarize by workstream:

- Completed workstreams
- Blocked/failed workstreams and why
- Files changed or evidence gathered
- Verification run
- Carryover items
