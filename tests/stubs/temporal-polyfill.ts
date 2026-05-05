/**
 * Stub-модуль для temporal-polyfill.
 */

export const Temporal = {
	Now: {
		instant: () => ({
			get epochMilliseconds() {
				return Date.now();
			},
		}),
	},
};
