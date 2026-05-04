/**
 * signal-detect.ts — Модуль детекции сигналов для evolver pi-адаптера.
 *
 * Предоставляет функции для анализа текста и diff-вывода на предмет
 * характерных сигналов (ошибки, узкие места, запросы функций и т.д.).
 */

// Ключевые слова для каждого типа сигнала (EN + RU)
const SIGNAL_KEYWORDS: Record<string, string[]> = {
  perf_bottleneck: [
    'timeout', 'slow', 'latency', 'bottleneck', 'oom',
    'out of memory', 'performance',
    'таймаут', 'медленно', 'тормозит', 'узкое место', 'память',
    'производительность', 'зависает', 'зависание', 'перегрузка',
  ],
  capability_gap: [
    'not supported', 'unsupported', 'not implemented',
    'missing feature', 'not available',
    'не поддерживается', 'не реализовано', 'отсутствует',
    'нет возможности', 'недоступно',
  ],
  log_error: [
    'error:', 'exception:', 'typeerror', 'referenceerror',
    'syntaxerror', 'failed',
    'ошибка:', 'исключение:', 'сбой', 'упал', 'краш', 'аварийно',
  ],
  user_feature_request: [
    'add feature', 'implement', 'new function', 'new module', 'please add',
    'добавь', 'реализуй', 'новая функция', 'новый модуль',
    'сделай', 'нужно добавить', 'хочу', 'пожалуйста',
  ],
  recurring_error: [
    'same error', 'still failing', 'not fixed', 'keeps failing', 'repeatedly',
    'та же ошибка', 'всё ещё падает', 'не исправлено',
    'постоянно', 'снова и снова', 'каждый раз',
  ],
  deployment_issue: [
    'deploy failed', 'build failed', 'ci failed', 'pipeline', 'rollback',
    'деплой упал', 'сборка упала', 'сборка сломалась',
    'пайплайн', 'откат', 'деплойment',
  ],
  test_failure: [
    'test failed', 'test failure', 'assertion', 'expect(', 'assert.',
    'тест упал', 'тест провален', 'тест сломался',
    'тестирование', 'не проходит',
  ],
};

// Regex-паттерны для diff-специфичной детекции сигналов (EN + RU)
const DIFF_SIGNAL_PATTERNS: Record<string, RegExp> = {
  log_error:               /error:|exception:|failed|ошибка:|исключение:|сбой|упал/i,
  perf_bottleneck:         /timeout|slow|latency|bottleneck|таймаут|медленно|тормозит|зависает/i,
  user_feature_request:    /add|implement|feature|new function|new module|добавь|реализуй|новая функция|сделай/i,
  user_improvement_suggestion: /improve|enhance|refactor|optimize|улучшить|оптимизировать|рефакторинг/i,
  capability_gap:          /not supported|unsupported|not implemented|не поддерживается|не реализовано|отсутствует/i,
  deployment_issue:        /deploy|ci|pipeline|build failed|деплой|сборка|пайплайн|откат/i,
  test_failure:            /test fail|assertion|expect\(|тест упал|тест провален|не проходит/i,
};

/**
 * Детектирует сигналы в произвольном тексте.
 *
 * Приводит текст к нижнему регистру и проверяет наличие ключевых слов
 * для каждого типа сигнала. Возвращает массив уникальных сигналов.
 *
 * @param text — анализируемый текст
 * @returns массив уникальных имён сигналов
 */
export function detectSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        found.add(signal);
        break; // достаточно одного совпадения на сигнал
      }
    }
  }

  return Array.from(found);
}

/**
 * Детектирует сигналы в diff-выводе.
 *
 * Помимо стандартных ключевых слов использует regex-паттерны,
 * адаптированные для формата diff. Если ни один сигнал не найден,
 * возвращается fallback-сигнал stable_success_plateau.
 *
 * @param diff — текст diff-вывода
 * @returns массив уникальных имён сигналов
 */
export function detectSignalsFromDiff(diff: string): string[] {
  const found = new Set<string>();

  // Проверяем regex-паттерны, специфичные для diff
  for (const [signal, pattern] of Object.entries(DIFF_SIGNAL_PATTERNS)) {
    if (pattern.test(diff)) {
      found.add(signal);
    }
  }

  // Дополнительно проверяем стандартные ключевые слова
  const signalsFromKeywords = detectSignals(diff);
  for (const signal of signalsFromKeywords) {
    found.add(signal);
  }

  // Если сигналов не найдено — возвращаем fallback
  if (found.size === 0) {
    found.add('stable_success_plateau');
  }

  return Array.from(found);
}
