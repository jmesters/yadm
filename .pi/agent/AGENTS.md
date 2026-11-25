# pi-only instructions

The shared instructions are in `~/.claude/CLAUDE.md`, which pi-code loads; this file holds only what applies to pi.

## Delegating sub-tasks

Once you have done the higher-level work (understanding the problem, design, deciding exactly what to change), you may hand well-specified, self-contained sub-tasks to the `worker` subagent (runs on Sonnet) with the `subagent` tool, in parallel mode when they are independent. Give it precise instructions (files, expected change, how to verify). Keep design decisions, ambiguous work and the final review of its output yourself. Don't delegate when doing the work directly is just as fast.
