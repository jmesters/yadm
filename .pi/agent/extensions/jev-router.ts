/**
 * Jev router for Anthropic - adapted from pi's examples/extensions/jev-router.ts.
 *
 * Registers the virtual model `jev/auto`. Policy: over-estimate rather than under-estimate. A weaker
 * model's mistakes cost rework and review, which is worth more than the token difference.
 *
 * - Haiku only when the Jev classifier (TypeSafe) is confident the prompt is simple.
 * - Opus for everything else, and whenever Jev is missing or fails.
 * - Sonnet is not used in the main session. Opus can hand well-specified sub-tasks to the `worker`
 *   subagent (Sonnet, ~/.pi/agent/agents/worker.md) once the higher-level work is done; this
 *   extension adds that guideline to the system prompt.
 *
 * Every later user prompt is rated again, but a session only moves UP (Haiku -> Opus), never down,
 * and very short prompts ("yes", "fix that") are skipped because they inherit the context's
 * difficulty. Compaction summaries and other direct requests use Opus too (they shape everything
 * after them, and an Opus session reuses its prompt cache).
 *
 * Decisions and fallbacks are logged to ~/.pi/agent/jev-router.log.
 * The selected thinking level passes through to the chosen model.
 *
 * Requires: Anthropic login, TYPESAFE_API_KEY. Usage: pi --model jev/auto
 */

import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";

const PROVIDER = "anthropic";
const MODELS = {
	simple: "claude-haiku-5-5",
	complex: "claude-opus-5-5",
} as const;
const FALLBACK = MODELS.complex;

/** Haiku only when `simple` is at least this likely; everything else goes to Opus. */
const SIMPLE_THRESHOLD = 0.8;

/** Prompts shorter than this are not reclassified (they depend on the existing context). */
const MIN_RECLASSIFY_CHARS = 40;

const RANK: Record<string, number> = {
	[MODELS.simple]: 0,
	[MODELS.complex]: 1,
};

const WORKER_GUIDELINE = [
	"Delegating sub-tasks: once you have done the higher-level work (understanding the problem, design,",
	"deciding exactly what to change), you may hand well-specified, self-contained sub-tasks to the `worker`",
	"subagent (runs on Sonnet) with the `subagent` tool, in parallel mode when they are independent. Give it",
	"precise instructions (files, expected change, how to verify). Keep design decisions, ambiguous work and",
	"the final review of its output yourself. Don't delegate when doing the work directly is just as fast.",
].join(" ");

const LOG_FILE = join(homedir(), ".pi", "agent", "jev-router.log");

/** Append one line to the router log (never throws, never touches the TUI). */
function log(event: string, data: Record<string, unknown> = {}): void {
	try {
		appendFileSync(LOG_FILE, `${new Date().toISOString()} ${event} ${JSON.stringify(data)}\n`);
	} catch {
		// logging must never break routing
	}
}

interface JevState {
	model: string;
	/** Number of user messages already seen, so each prompt is classified at most once. */
	userCount?: number;
}

type JevRequest = ModelRouteRequest<JevState>;

function routeTo(request: JevRequest, ctx: ExtensionContext, id: string, state?: JevState): ModelRoute<JevState> {
	const model = ctx.modelRegistry.find(PROVIDER, id);
	if (!model) throw new Error(`Model ${PROVIDER}/${id} is not in the catalog`);
	return { model, thinkingLevel: request.thinkingLevel, state };
}

function textOf(message: Message): string {
	const c = message.content;
	if (typeof c === "string") return c;
	return c.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
}

function userTexts(messages: readonly Message[]): string[] {
	return messages.filter((message) => message.role === "user").map(textOf);
}

async function chooseModel(request: JevRequest, ctx: ExtensionContext): Promise<string> {
	// Switching to jev/auto mid-session: keep Opus if already on it (no cache miss); anything else is classified.
	const previous = request.previous?.model;
	if (previous?.provider === PROVIDER && previous.id === MODELS.complex) return MODELS.complex;
	return classifyPrompt(request, ctx);
}

async function classifyPrompt(request: JevRequest, ctx: ExtensionContext): Promise<string> {
	const jev = ctx.modelRegistry.findOfType("classifier", "typesafe", "jev-latest");
	if (!jev) {
		log("fallback", { reason: "classifier-not-found", model: FALLBACK });
		return FALLBACK;
	}
	const users = userTexts(request.messages);
	const prompt = users.at(-1) ?? "";
	try {
		const result = await ctx.modelRegistry.classify(
			jev,
			{
				state: {
					prompt: prompt.slice(0, 16_000),
					previous_prompt: users.length > 1 ? users[users.length - 2].slice(0, 1_500) : "",
				},
				questions: {
					complexity: {
						type: "choice",
						instructions:
							"How demanding is the software engineering work requested in `prompt`? `previous_prompt` is the user's prior request, for context only; it may be about something unrelated.",
						criteria: {
							simple: "Quick questions, small lookups, or trivial one-line edits",
							standard: "Ordinary features, fixes, reviews, or explanations",
							complex: "Subtle design, cross-cutting changes, or hard debugging",
						},
					},
				},
			},
			{ signal: request.signal },
		);
		const answer = result.stopReason === "stop" ? result.answers.complexity : undefined;
		if (answer?.type !== "choice") {
			log("fallback", { reason: "no-answer", stopReason: result.stopReason, error: result.errorMessage, model: FALLBACK });
			return FALLBACK;
		}
		const p = answer.probabilities;
		const picked = (p.simple ?? 0) >= SIMPLE_THRESHOLD ? MODELS.simple : MODELS.complex;
		log("classified", { probabilities: p, picked, promptChars: prompt.length });
		return picked;
	} catch (error) {
		log("fallback", { reason: "error", error: String(error), model: FALLBACK });
		return FALLBACK;
	}
}

export default function (pi: ExtensionAPI) {
	// Tell Opus it may delegate sub-tasks to the Sonnet `worker` subagent.
	pi.on("before_agent_start", async (event, ctx) => {
		const onRouterOrOpus = ctx.model?.provider === "jev" || ctx.model?.id === MODELS.complex;
		const hasSubagent = event.systemPromptOptions?.selectedTools?.includes("subagent") ?? false;
		if (!onRouterOrOpus || !hasSubagent) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${WORKER_GUIDELINE}` };
	});

	pi.registerVirtualModel<JevState>({
		provider: "jev",
		id: "auto",
		name: "Auto (Jev → Claude)",
		thinkingLevels: ["low", "medium", "high", "xhigh"],
		async route(request, ctx) {
			if (request.reason === "direct") {
				log("direct", { model: MODELS.complex });
				return routeTo(request, ctx, MODELS.complex);
			}
			const userCount = userTexts(request.messages).length;
			const state = request.state;
			// No state yet, or state from the old 3-tier router (Sonnet): classify from scratch.
			if (!state || RANK[state.model] === undefined) {
				const model = await chooseModel(request, ctx);
				return routeTo(request, ctx, model, { model, userCount });
			}
			// New user prompt: reclassify, but only upgrade (never downgrade, to protect the cache).
			if (state.userCount !== undefined && userCount > state.userCount) {
				const next: JevState = { ...state, userCount };
				if (state.model !== MODELS.complex && (userTexts(request.messages).at(-1) ?? "").trim().length >= MIN_RECLASSIFY_CHARS) {
					const candidate = await classifyPrompt(request, ctx);
					if ((RANK[candidate] ?? 0) > (RANK[state.model] ?? 0)) {
						return routeTo(request, ctx, candidate, { model: candidate, userCount });
					}
				}
				return routeTo(request, ctx, state.model, next);
			}
			// Legacy state (no userCount) or compaction shrinking the history: just resync the counter.
			return routeTo(request, ctx, state.model, state.userCount === userCount ? undefined : { ...state, userCount });
		},
	});
}
