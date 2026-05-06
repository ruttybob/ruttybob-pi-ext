/**
 * Stub для @sinclair/typebox/value.
 *
 * Предоставляет минимальные экспорты для тестирования.
 * Value.Check реализует базовую валидацию JSON Schema.
 */

function check(schema: any, data: unknown): boolean {
	if (!schema || typeof schema !== "object") return true;

	// Optional + undefined → ok
	if (schema.optional === true && data === undefined) return true;

	// anyOf (Union)
	if (schema.anyOf) {
		return schema.anyOf.some((s: any) => check(s, data));
	}

	if (data === null || data === undefined) return false;

	switch (schema.type) {
		case "string":
			if (typeof data !== "string") return false;
			if (schema.maxLength !== undefined && data.length > schema.maxLength) return false;
			if (schema.minLength !== undefined && data.length < schema.minLength) return false;
			return true;

		case "number":
			return typeof data === "number";

		case "boolean":
			return typeof data === "boolean";

		case "null":
			return data === null;

		case "array": {
			if (!Array.isArray(data)) return false;
			if (schema.minItems !== undefined && data.length < schema.minItems) return false;
			if (schema.maxItems !== undefined && data.length > schema.maxItems) return false;
			if (schema.items) {
				return data.every((item) => check(schema.items, item));
			}
			return true;
		}

		case "object": {
			if (typeof data !== "object" || Array.isArray(data) || data === null) return false;
			const props = schema.properties ?? {};
			for (const [key, propSchema] of Object.entries(props)) {
				const isOptional = propSchema && typeof propSchema === "object" && propSchema.optional === true;
				if (!(key in data)) {
					if (!isOptional) return false;
					continue;
				}
				if (!check(propSchema, (data as any)[key])) return false;
			}
			return true;
		}

		default:
			return true;
	}
}

export const Value = {
	/** Убирает неизвестные поля из объекта по схеме. Stub: возвращает как есть. */
	Clean(_schema: unknown, value: unknown): unknown {
		return value;
	},
	/** Проверяет, соответствует ли значение схеме. */
	Check(schema: unknown, value: unknown): boolean {
		return check(schema, value);
	},
};
