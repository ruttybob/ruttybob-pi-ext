export function registerStrings(_ns: string, _byLocale: Record<string, Record<string, string>>) {}
export function scope(_ns: string) {
	return (_key: string, fallback: string) => fallback;
}
