/**
 * Jev router for Anthropic - adapted from pi's examples/extensions/jev-router.ts.
 *
 * Registers the virtual model `jev/auto`. On the first request of a session, the Jev classifier
 * (TypeSafe) rates the user's prompt and picks a model. Every later user prompt is rated again, but
 * the session only ever moves UP a tier (Haiku -> Sonnet -> Opus), never down, and very short
 * prompts ("yes", "fix that") are skipped because they inherit the context's difficulty:
 *
 * - simple   -> Haiku   (quick questions, small lookups, trivial edits)
 * - standard -> Sonnet  (ordinary features, fixes, reviews)
 * - complex  -> Opus    (subtle design, cross-cutting changes, hard debugging)
 *
 * Opus plans and makes the first edit; after the first successful `edit`/`write`, the session
 * hands over to Sonnet (one prompt-cache miss). Haiku and Sonnet sessions stay where they are.
 * Without TypeSafe credentials (or if Jev fails), the router falls back to Sonnet.
 *
 * The phase is router state, stored on the session branch (survives compaction, follows /tree).
 * The selected thinking level passes through to the chosen model.
 *
 * Requires: Anthropic login, TYPESAFE_API_KEY. Usage: pi --model jev/auto
 */

import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";

const PROVIDER = "anthropic";
const MODELS = {
	simple: "claude-haiku-5-5",
	standard: "claude-sonnet-5-5",
	complex: "claude-opus-5-5",
} as const;
/** Model that takes over once Opus has made the first edit, and that handles compaction summaries. */
const IMPLEMENTER = MODELS.standard;
const FALLBACK = MODELS.standard;

const EDIT_TOOLS = new Set(["edit", "write"]);

/** Prompts shorter than this are not reclassified (they depend on the existing context). */
const MIN_RECLASSIFY_CHARS = 40;
const RANK: Record<string, number> = {
	[MODELS.simple]: 0,
	[MODELS.standard]: 1,
	[MODELS.complex]: 2,
};

interface JevState {
	phase: "planning" | "implementation";
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

function lastUserText(messages: readonly Message[]): string {
	const content = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
	if (typeof content === "string") return content;
	return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
}

function editedThisTurn(messages: readonly Message[]): boolean {
	const lastUser = messages.findLastIndex((message) => message.role === "user");
	return messages
		.slice(lastUser + 1)
		.some((message) => message.role === "toolResult" && EDIT_TOOLS.has(message.toolName) && !message.isError);
}

function countUserMessages(messages: readonly Message[]): number {
	return messages.filter((message) => message.role === "user").length;
}

async function chooseModel(request: JevRequest, ctx: ExtensionContext): Promise<string> {
	// Switching to jev/auto mid-session: keep the Anthropic model already in use (no cache miss).
	const previous = request.previous?.model;
	if (previous?.provider === PROVIDER && Object.values(MODELS).includes(previous.id as never)) return previous.id;
	return classifyPrompt(request, ctx);
}

async function classifyPrompt(request: JevRequest, ctx: ExtensionContext): Promise<string> {
	const jev = ctx.modelRegistry.findOfType("classifier", "typesafe", "jev-latest");
	if (!jev) return FALLBACK;
	try {
		const result = await ctx.modelRegistry.classify(
			jev,
			{
				state: { prompt: lastUserText(request.messages).slice(0, 16_000) },
				questions: {
					complexity: {
						type: "choice",
						instructions: "How demanding is the software engineering work requested in `prompt`?",
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
		if (answer?.type !== "choice") return FALLBACK;
		const p = answer.probabilities;
		if ((p.complex ?? 0) >= 0.5) return MODELS.complex;
		if ((p.simple ?? 0) >= 0.6) return MODELS.simple;
		return MODELS.standard;
	} catch {
		return FALLBACK;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerVirtualModel<JevState>({
		provider: "jev",
		id: "auto",
		name: "Auto (Jev → Claude)",
		thinkingLevels: ["low", "medium", "high", "xhigh"],
		async route(request, ctx) {
			if (request.reason === "direct") return routeTo(request, ctx, IMPLEMENTER);
			const state = request.state;
			const userCount = countUserMessages(request.messages);
			if (!state) {
				const model = await chooseModel(request, ctx);
				return routeTo(request, ctx, model, { phase: "planning", model, userCount });
			}
			// New user prompt: reclassify, but only upgrade (never downgrade, to protect the cache).
			if (state.userCount !== undefined && userCount > state.userCount) {
				const next: JevState = { ...state, userCount };
				if (lastUserText(request.messages).trim().length >= MIN_RECLASSIFY_CHARS) {
					const candidate = await classifyPrompt(request, ctx);
					if ((RANK[candidate] ?? 0) > (RANK[state.model] ?? 0)) {
						return routeTo(request, ctx, candidate, { phase: "planning", model: candidate, userCount });
					}
				}
				return routeTo(request, ctx, state.model, next);
			}
			// Opus made the first edit: hand the rest of the work to Sonnet.
			if (state.phase === "planning" && state.model === MODELS.complex && editedThisTurn(request.messages)) {
				return routeTo(request, ctx, IMPLEMENTER, { phase: "implementation", model: IMPLEMENTER, userCount });
			}
			// Legacy state (no userCount) or compaction shrinking the history: just resync the counter.
			return routeTo(request, ctx, state.model, state.userCount === userCount ? undefined : { ...state, userCount });
		},
	});
}
