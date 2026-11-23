---
description: Review open PRs in parallel (pr-reviewer), then fix the decided findings in parallel (pr-fixer)
argument-hint: "[PR numbers or a filter, e.g. 161 177 178 | base develop, not batches]"
---
Run the PR review-and-fix pipeline on: ${@:-every open, non-draft PR into develop that is not a batch PR itself}.

You are the orchestrator. Keep your own context small: subagents do the reading, fixing and long
checks; you plan, decide and synthesise. Never fix code yourself: a fix you make skips review.

0. **Run folder and ledger.** Use `${TMPDIR:-/tmp}/pr-pipeline/<repo>-<YYYY-MM-DD>/` as the run
   folder. If it already holds a `progress.md`, read it and `git log` the PR branches, then resume
   from where it stops: never re-dispatch a step the ledger records as done. Otherwise create it with
   `# PR pipeline ledger: <repo>, <scope>` as its first line. After every step, append one line per
   PR: `#<n>: reviewed (<verdict>, report <path>)`, `#<n>: decision: <fix 1,3 | comment | merge |
   close> (<why>)`, `#<n>: fix round <r>/2 (<status>, commit <hash>)`, `#<n>: re-review (<k>
   addressed, <m> open)`, `#<n>: merged | closed | left for user (<why>)`. Trust the ledger and git
   over your memory after a compaction.
1. **Review (parallel, read-only).** `git fetch` the PR branches, then one `pr-reviewer` subagent per
   PR via the `subagent` tool in parallel mode (max 8 tasks per call, 4 run at once), `cwd` = the repo
   root. Give each the PR number, branch, base, its report path (`<run>/pr-<n>-review.md`), and any
   context you know (related batch, PRs touching the same files). State facts only: never tell a
   reviewer what not to flag or how to rate a finding; if you think a finding is wrong, decide that
   after the review.
2. **Check and report.** Read each report file. Re-read in the code every Important finding before
   reporting it, and resolve every "Cannot verify" item yourself (run the check through a subagent if
   it needs a build or a long run): a confirmed gap becomes a finding. Report one table (PR, verdict,
   CI, findings), then the details of each finding that needs a decision, with your recommendation,
   plus cross-PR conflicts and merge order. Nothing is posted to GitHub at this step.
3. **Decide with the user.** Per PR: fix (which findings, which design when there is a choice),
   comment, approve and merge (only with the user's say-so; admin bypass only when asked), or close.
4. **Fix (parallel, each PR in its own worktree).** One `pr-fixer` per PR to fix, with a
   self-contained brief: repo root, PR number and branch, the findings to fix (paste the reviewer's
   Fix lines verbatim, plus the GitHub review comment id when a finding came from one), the decisions
   taken, what to verify, and its report path (`<run>/pr-<n>-fix.md`). Fixers on PRs that touch the
   same files, or that depend on each other, run in a chain (the dependent one merges the other's
   branch), not in parallel. Handle the status each returns:
   - `DONE`: go to step 5.
   - `DONE_WITH_CONCERNS`: read the concerns; correctness or scope doubts go to the user before
     the re-review, observations go in the ledger.
   - `NEEDS_CONTEXT`: give the missing context and re-dispatch.
   - `BLOCKED`: change something before retrying (more context, a smaller brief, or the user's
     decision when the brief itself is wrong); never resend the same brief unchanged.
5. **Check, then re-review.** Before the re-review, check the fixer's claims yourself:
   `git fetch` and `git log origin/<branch>` show the commit it names, and its report holds the
   commands it ran and their output. Then one `pr-reviewer` per pushed fix in re-review mode: the
   findings it had to fix (verbatim), the fix commit range (the head the first review saw `..` the
   new head), and the fix report path. A finding left NOT ADDRESSED, or new Important breakage in
   the fix diff, goes back to a fixer with a new brief (round 2). Out-of-scope observations go in
   the ledger and do not extend the loop. **Cap: 2 fix rounds per PR.** If findings are still open
   after round 2, stop and give the user each open finding with the reviewer's and the fixer's side.
6. **Close out.** For each PR the user approved: `gh pr checks` must be green on the final head
   (wait for running checks; a red check goes back to the user, not to a merge). Then approve and
   merge, remove the fix worktrees, and give the user a short summary: per PR, what was done and
   what is left for them. Keep the run folder until the user has read the summary.
