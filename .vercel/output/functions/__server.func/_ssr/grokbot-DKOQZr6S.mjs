// node_modules/.nitro/vite/services/ssr/assets/grokbot-DKOQZr6S.js
var GROK_PREFIX = "/grok ";
/** Bouwt de JSON die naar de Grok Bot-routine gaat. */
function buildGrokPayload(opdracht, context, now = /* @__PURE__ */ new Date()) {
	const text = String(opdracht ?? "").trim().slice(0, 4e3);
	if (!text) throw new Error("Een opdracht kan niet leeg zijn.");
	return {
		opdracht: text,
		context: {
			view: String(context?.view ?? "").slice(0, 60),
			ids: (context?.ids ?? []).map((id) => String(id).slice(0, 80)).filter(Boolean).slice(0, 50),
			samenvatting: String(context?.samenvatting ?? "").slice(0, 2e3)
		},
		bron: "kade",
		tijd: now.toISOString()
	};
}
/** Haalt de opdracht uit een terminalregel met '/grok ' als prefix; null als het geen Grok-commando is. */
function parseGrokCommand(line) {
	const value = String(line ?? "").trimStart();
	if (!value.toLowerCase().startsWith("/grok ".trim())) return null;
	const rest = value.slice(GROK_PREFIX.trim().length);
	if (rest && !/^\s/.test(rest)) return null;
	return rest.trim();
}
/** Header voor de sender key. */
function authHeader(mode, headerName, key) {
	if (mode === "custom") {
		const name = headerName.trim();
		if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) throw new Error("Ongeldige headernaam.");
		return [name, key];
	}
	return ["Authorization", `Bearer ${key}`];
}
/** Toont enkel de laatste 4 tekens van een sleutel. */
function maskKey(key) {
	if (!key) return "";
	return `••••${key.slice(-4)}`;
}
function validWebhookUrl(url) {
	try {
		const u = new URL(url);
		return u.protocol === "https:" || u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
	} catch {
		return false;
	}
}
export { validWebhookUrl as a, parseGrokCommand as i, buildGrokPayload as n, maskKey as r, authHeader as t };
