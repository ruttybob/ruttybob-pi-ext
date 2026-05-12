/**
 * pi-review — Review current pi work in a new branch with conversation context.
 *
 * Форк pi-review@1.1.1 с расширениями:
 * - Настройка модели и thinking level через settings.json (секция `review`)
 * - Автоматический restore модели и thinking level после ревью (agent_end)
 * - /review-back дополнительно восстанавливает модель из метаданных
 * - Git diff в контексте ревью (опционально, с лимитом строк)
 * - Кастомизируемый промпт (файл/settings/fallback)
 *
 * Конфигурация (опционально, в settings.json):
 * ```json
 * {
 *   "review": {
 *     "model": "openrouter/deepseek/deepseek-v4-pro",
 *     "thinkingLevel": "high"
 *   }
 * }
 * ```
 */

import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";

import { sendMessageInNewBranch } from "./lib/child-session.js";
import {
	extractConversation,
	extractLatestAssistantText,
	formatConversation,
} from "./lib/conversation-context.js";
import { collectGitDiff, DEFAULT_DIFF_MAX_LINES } from "./lib/git-diff.js";
import {
	loadPromptTemplate,
	renderPromptTemplate,
	getProjectName,
} from "./lib/prompt.js";
import { loadReviewConfig, parseModelId, validateThinkingLevel, type ReviewThinkingLevel } from "./lib/settings.js";

const REVIEW_METADATA_TYPE = "pi-review";

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

/** Снимок состояния сессии до начала ревью — для restore. */
interface OriginalState {
	model: Model<Api> | undefined;
	thinkingLevel: ThinkingLevel;
}

type ReviewMetadata = {
	kind: "review";
	reviewedLeafId: string;
	/** Составной ID исходной модели для restore при /review-back. */
	originalModelComposite?: string;
};

const REVIEW_INSTRUCTION = `Review the available work and context.
Put your strict maintainer hat on.
Find concrete, high-confidence, material issues introduced by the work or revealed by the additional context.
Do not stop after the first few findings; keep reviewing until you have checked the full diff/context, then do one final pass specifically for issues you may have missed.
Verify completeness against the stated task, requirements, and acceptance criteria; flag missing or partially implemented requirements as findings.
Focus on correctness, security, performance, operability, and maintainability.
Do not speculate; point to the affected behavior, invariant, or code path.
Prefer issues the author would likely fix before merge.
Assume existing interfaces and behavior should remain backward compatible unless the user or project instructions explicitly say otherwise.
If nothing material stands out, say \`looks good\`; otherwise return numbered sections for findings, sorted by priority.
Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for limited-scope correctness, performance, or maintainability issues; [P3] for minor but real issues.
For each finding, include a [P0]-[P3] tag, location, a concise summary, a concise explanation of the affected behavior, invariant, or code path, and \`Recommendation:\` with the top specific, actionable fix, stated concisely.`;

/**
 * Строит инструкцию ревью с учётом кастомного шаблона.
 * Если шаблон найден (файл/settings) — использует его с подстановкой {{focus}}/{{project}}.
 * Иначе — fallback на REVIEW_INSTRUCTION.
 */
function buildReviewInstruction(args: string, cwd: string, config: ReturnType<typeof loadReviewConfig>): string {
	const focusText = args.trim();
	const template = loadPromptTemplate(cwd, config);

	if (template) {
		return renderPromptTemplate(template, {
			focus: focusText || "",
			project: getProjectName(cwd),
		});
	}

	// Fallback — захардкоженная инструкция
	if (!focusText) {
		return REVIEW_INSTRUCTION;
	}
	return [REVIEW_INSTRUCTION, "Additional review context:", focusText].join("\n\n");
}

function buildReviewMessage(
	args: string,
	cwd: string,
	config: ReturnType<typeof loadReviewConfig>,
	conversationXml?: string,
	gitDiff?: string,
): string {
	const sections: string[] = [];

	// Контекст разговора
	if (conversationXml) {
		sections.push(
			"Conversation context copied from the current branch (user + assistant messages only; thinking and tool calls removed):",
			"",
			"````xml",
			conversationXml,
			"````",
		);
	}

	// Git diff
	if (gitDiff) {
		sections.push(
			"Git diff of uncommitted changes:",
			"",
			"```diff",
			gitDiff,
			"```",
		);
	}

	// Инструкция по ревью — всегда последняя
	sections.push(buildReviewInstruction(args, cwd, config));

	return sections.join("\n\n");
}

function isReviewMetadata(data: unknown): data is ReviewMetadata {
	return (
		!!data &&
		typeof data === "object" &&
		"kind" in data &&
		data.kind === "review" &&
		"reviewedLeafId" in data &&
		typeof data.reviewedLeafId === "string"
	);
}

function findReviewMetadata(branch: SessionEntry[]): ReviewMetadata | undefined {
	for (const entry of [...branch].reverse()) {
		if (entry.type !== "custom" || entry.customType !== REVIEW_METADATA_TYPE) continue;
		if (isReviewMetadata(entry.data)) return entry.data;
	}

	return undefined;
}

function buildReviewBackEditorText(reviewReport: string): string {
	return [
		"<review_findings>",
		reviewReport.trim(),
		"</review_findings>",
	].join("\n");
}

export default function reviewExtension(pi: ExtensionAPI) {
	let originalState: OriginalState | undefined;

	/** Async-restore модели и thinking level после завершения ревью. */
	async function restoreOriginalState(): Promise<void> {
		if (!originalState) return;

		const state = originalState;
		originalState = undefined;

		// Восстанавливаем thinking level
		pi.setThinkingLevel(state.thinkingLevel);

		// Восстанавливаем модель
		if (state.model) {
			try {
				await pi.setModel(state.model);
			} catch {
				// Модель могла стать недоступной — тихо игнорируем
			}
		}
	}

	// Restore после завершения ревью-тура (агент закончил работу в review-ветке).
	// Проверяем, что текущая ветка содержит ReviewMetadata — иначе это не review-ветка.
	pi.on("agent_end", (_event, ctx) => {
		if (!originalState) return;

		// Привязка к review-ветке: проверяем наличие ReviewMetadata в текущей ветке.
		const branch = ctx.sessionManager.getBranch();
		const metadata = findReviewMetadata(branch);
		if (!metadata) return;

		restoreOriginalState();
	});

	pi.registerCommand("review", {
		description: "Review current work in new branch (optional focus text)",
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				await ctx.waitForIdle();
			}

			// Guard от повторного /review — если originalState уже установлен, ревью в процессе.
			if (originalState) {
				ctx.ui.notify(
					"pi-review: ревью уже в процессе. Сначала выполните /review-back или дождитесь завершения.",
					"warning",
				);
				return;
			}

			const branch = ctx.sessionManager.getBranch();
			const reviewedLeafId = ctx.sessionManager.getLeafId();
			const extractedConversation = extractConversation(branch);
			const conversationXml =
				extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);

			// --- Git diff ---
			let gitDiff: string | undefined;
			const config = loadReviewConfig(ctx.cwd);
			if (config.includeDiff !== false) {
				const maxLines = config.diffMaxLines ?? DEFAULT_DIFF_MAX_LINES;
				const result = collectGitDiff({ cwd: ctx.cwd, maxLines });
				if (result) {
					gitDiff = result.diff;
					if (result.truncated) {
						ctx.ui.notify(
							`pi-review: git diff обрезан до ${maxLines} строк (всего ${result.totalLines})`,
							"warning",
						);
					}
				}
			}

			const reviewMessage = buildReviewMessage(args, ctx.cwd, config, conversationXml, gitDiff);

			// --- Snapshot текущего состояния ---
			originalState = {
				model: ctx.model,
				thinkingLevel: pi.getThinkingLevel(),
			};

			// --- Применяем конфигурацию из settings.json ---
			// config уже загружен выше для includeDiff/diffMaxLines

			// Модель — парсим составной ID ("provider/model")
			if (config.model) {
				const parsed = parseModelId(config.model);
				if (parsed) {
					const targetModel = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
					if (targetModel) {
						const ok = await pi.setModel(targetModel);
						if (!ok) {
							ctx.ui.notify(
								`pi-review: нет API-ключа для ${config.model}, используется текущая модель`,
								"warning",
							);
						}
					} else {
						ctx.ui.notify(
							`pi-review: модель ${config.model} не найдена в реестре, используется текущая модель`,
							"warning",
						);
					}
				} else {
					ctx.ui.notify(
						`pi-review: невалидный формат model "${config.model}". Ожидается "provider/model" (например, "openrouter/deepseek/deepseek-v4-pro")`,
						"warning",
					);
				}
			}

			// Thinking level — с runtime-валидацией
			const reviewThinkingLevel = validateThinkingLevel(config.thinkingLevel);
			pi.setThinkingLevel(reviewThinkingLevel);

			// --- Запуск ревью в новой ветке ---
			let started = false;
			try {
				started = await sendMessageInNewBranch(pi, ctx, branch, reviewMessage, "review", () => {
					if (!reviewedLeafId) return;
					// Сохраняем метаданные для /review-back, включая исходную модель
					const metadata: ReviewMetadata = {
						kind: "review",
						reviewedLeafId,
						originalModelComposite: originalState?.model
							? `${originalState.model.provider}/${originalState.model.id}`
							: undefined,
					};
					pi.appendEntry(REVIEW_METADATA_TYPE, metadata);
				});
			} finally {
				if (!started) restoreOriginalState();
			}
			if (!started) return;

			if (ctx.hasUI) {
				ctx.ui.setEditorText("");
			}
		},
	});

	pi.registerCommand("review-back", {
		description: "Return to reviewed branch with review findings in the editor",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				await ctx.waitForIdle();
			}

			if (!ctx.hasUI) {
				ctx.ui.notify(
					"pi-review: /review-back не поддерживается в headless-режиме",
					"warning",
				);
				return;
			}

			const branch = ctx.sessionManager.getBranch();
			const metadata = findReviewMetadata(branch);
			if (!metadata) {
				ctx.ui.notify("No review branch metadata found", "warning");
				return;
			}

			const reviewReport = extractLatestAssistantText(branch);
			if (!reviewReport) {
				ctx.ui.notify("No assistant review report found", "warning");
				return;
			}

			let result: Awaited<ReturnType<typeof ctx.navigateTree>>;
			try {
				result = await ctx.navigateTree(metadata.reviewedLeafId, { summarize: false });
			} catch (err) {
				ctx.ui.notify(
					`pi-review: ошибка навигации — ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
				// Гарантируем restore модели даже при падении navigateTree
				if (metadata.originalModelComposite) {
					const parsed = parseModelId(metadata.originalModelComposite);
					if (parsed) {
						const originalModel = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
						if (originalModel) {
							try { await pi.setModel(originalModel); } catch { /* тихо */ }
						}
					}
				}
				return;
			}

			if (result.cancelled) {
				ctx.ui.notify("Return to reviewed branch cancelled", "info");
				return;
			}

			// Belt-and-suspenders: восстанавливаем модель из метаданных,
			// на случай если agent_end не сработал или сессия была перезагружена.
			if (metadata.originalModelComposite) {
				const parsed = parseModelId(metadata.originalModelComposite);
				if (parsed) {
					const originalModel = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
					if (originalModel) {
						await pi.setModel(originalModel);
					}
				}
			}

			ctx.ui.setEditorText(buildReviewBackEditorText(reviewReport));
			ctx.ui.notify("Returned to reviewed branch", "info");
		},
	});
}
