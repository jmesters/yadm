---
description: Review open PRs in parallel (pr-reviewer), then fix the decided findings in parallel (pr-fixer)
argument-hint: "[PR numbers or a filter, e.g. 161 177 178 | base develop, not batches]"
---
Run the PR review-and-fix pipeline on: ${@:-every open, non-draft PR into develop that is not a batch PR itself}.

You are the orchestrator. Keep your own context small: subagents do the reading, fixing and long
checks; you plan, decide and synthesise.

1. **Review (parallel, read-only).** `git fetch` the PR branches, then one `pr-reviewer` subagent per
   PR via the `subagent` tool in parallel mode (max 8 tasks per call, 4 run at once), `cwd` = the repo
   root. Give each the PR number, branch, base, and any context you know (related batch, PRs touching
   the same files).
2. **Check and report.** Re-read in the code every Important finding before reporting it. Report one
   table (PR, verdict, findings), then the details of each finding that needs a decision, with your
   recommendation, plus cross-PR conflicts and merge order. Nothing is posted to GitHub at this step.
3. **Decide with the user.** Per PR: fix (which findings, which design when there is a choice),
   comment, approve and merge (only with the user's say-so; admin bypass only when asked), or close.
4. **Fix (parallel, each PR in its own worktree).** One `pr-fixer` per PR to fix, with a
   self-contained brief: repo root, PR number and branch, the findings to fix (paste the reviewer's
   Fix lines), the decisions taken, what to verify. Fixers on PRs that touch the same files, or that
   depend on each other, run in a chain (the dependent one merges the other's branch), not in parallel.
5. **Re-review.** One `pr-reviewer` per pushed fix in re-review mode (the commit hash and the brief).
   If it finds a problem, send a new brief to a fixer; don't fix it yourself.
6. **Close out.** Approve and merge what the user approved, remove the fix worktrees, and give the
   user a short summary: per PR, what was done and what is left for them.
