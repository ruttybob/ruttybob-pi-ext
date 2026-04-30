/**
 * Stub-модуль для @sinclair/typebox.
 *
 * Предоставляет минимальные экспорты для тестирования.
 */

export type Static<T extends any> = Record<string, any>;

export const Type = {
	Object<T extends Record<string, any>>(properties: T): any {
		return { type: "object", properties };
	},
	String(options?: any): any {
		return { type: "string", ...options };
	},
	Number(options?: any): any {
		return { type: "number", ...options };
	},
	Boolean(options?: any): any {
		return { type: "boolean", ...options };
	},
	Array(items: any, options?: any): any {
		return { type: "array", items, ...options };
	},
	Optional(schema: any): any {
		return { ...schema, optional: true };
	},
	Union(schemas: any[]): any {
		return { anyOf: schemas };
	},
	Literal(value: any): any {
		return { const: value };
	},
	Record(keySchema: any, valueSchema: any): any {
		return { type: "object", additionalProperties: valueSchema };
	},
	Ref($ref: string): any {
		return { $ref };
	},
	Null(options?: any): any {
		return { type: "null", ...options };
	},
	Any(options?: any): any {
		return { ...options };
	},
	Unknown(options?: any): any {
		return { ...options };
	},
	Partial(schema: any): any {
		return { ...schema, partial: true };
	},
};
