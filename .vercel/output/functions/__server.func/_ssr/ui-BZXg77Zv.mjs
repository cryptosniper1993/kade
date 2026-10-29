import { o as __toESM } from "../_runtime.mjs";
import { G as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as authClient } from "./client-B6x-1vPk.mjs";
import { r as createServerFn } from "./ssr.mjs";
import { r as authMiddleware } from "./day-BxYy7QRe.mjs";
import { r as createSsrRpc } from "./briefing-BKh7ysVD.mjs";
import { M as str, S as num, l as dateStr } from "./ops-shared-D7VxsQv_.mjs";
import { t as previewPathPrefix } from "./router-CmhO4p4H.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
// node_modules/.nitro/vite/services/ssr/assets/ui-BZXg77Zv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Current user + loading state. Same behavior in live preview and when deployed:
*   - Auth enabled -> the real signed-in user; `user` is `null` while
*                            the session resolves (`isPending: true`) and when
*                            signed out (`isPending: false`). Session comes from
*                            Better Auth `useSession()` → `/api/auth/get-session`
*                            (cookie when deployed; bearer in live preview).
*   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
*
* Protect a route by waiting out `isPending` before acting on `user` —
* redirecting on `user: null` alone bounces signed-in visitors to sign-in on
* every hard reload:
*
*   import { RedirectToSignIn } from "@/lib/auth/gates";
*   const { user, isPending } = useCurrentUserState();
*   if (isPending) return null;              // still resolving — don't redirect yet
*   if (!user) return <RedirectToSignIn />;  // definitely signed out
*
* `authEnabled` is a module-level constant fixed at load, so the guarded hook
* call keeps a stable hook order across every render of a given component.
*/
function useCurrentUserState() {
	return useSessionUserState();
}
function useSessionUserState() {
	const { data, isPending } = authClient.useSession();
	const id = data?.user.id;
	const displayName = data?.user.name ?? null;
	const primaryEmail = data?.user.email ?? null;
	const profileImageUrl = data?.user.image ?? null;
	const user = (0, import_react.useMemo)(() => id ? {
		id,
		displayName,
		primaryEmail,
		profileImageUrl,
		isDevFallback: false
	} : null, [
		id,
		displayName,
		primaryEmail,
		profileImageUrl
	]);
	return (0, import_react.useMemo)(() => ({
		user,
		isPending
	}), [user, isPending]);
}
function BootScreen({ label = "De kade wordt geladen" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-screen place-items-center bg-ink px-6 text-ivory",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-display text-6xl text-ivory",
					children: "KADE"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-4 h-px w-24 bg-brass" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-sm text-mist",
					children: label
				})
			]
		})
	});
}
var saveDocument = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const filename = str(row.filename, 180);
	const mime = str(row.mime, 80);
	const dataUrl = String(row.dataUrl ?? "");
	if (!filename || ![
		"image/png",
		"image/jpeg",
		"image/webp",
		"image/gif",
		"application/pdf"
	].includes(mime)) throw new Error("Enkel png, jpg, webp, gif of pdf.");
	if (!dataUrl.startsWith(`data:${mime}`) || dataUrl.length > 12e5) throw new Error("Bestand te groot of ongeldig. Houd het onder ongeveer 700 KB.");
	return {
		filename,
		mime,
		dataUrl,
		kind: str(row.kind, 40) || "bon",
		vendor: str(row.vendor, 160),
		docDate: row.docDate ? dateStr(row.docDate) : null,
		amountEur: row.amountEur == null || row.amountEur === "" ? null : num(row.amountEur),
		note: str(row.note, 400),
		clientId: str(row.clientId, 80),
		supplierId: str(row.supplierId, 80)
	};
}).handler(createSsrRpc("3b65e69e30264e9edc404bc8e775277ce651e6971ea15662655739d6002849cd"));
var getDocument = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => str(input?.id, 80)).handler(createSsrRpc("76035e517a9ccefde9c9a054d61ebcebf49d6913316c12976589dfbb33e4320e"));
var deleteDocument = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => str(input?.id, 80)).handler(createSsrRpc("1f05fafbd5c1adcbae6cb2f942084ae722453f7cc7d62074115241d7f9678f60"));
var seedDemo = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("284562eb0271dab1ae8c8e3a167b69a9b505c8e909bea52a78d68d1288e81d14"));
var clearDemo = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("a9158dc3e01084fbc96337c2daa18b8b5d4b17b867afd37a895d180109cec2a4"));
function href(file) {
	if (typeof window === "undefined") return `/${file}`;
	return `${previewPathPrefix(window.location.hostname, window.location.pathname) ?? ""}/${file}`;
}
function DeckLink() {
	const [pptx, setPptx] = (0, import_react.useState)("/kade-oprichter.pptx");
	const [pdf, setPdf] = (0, import_react.useState)("/kade-oprichter.pdf");
	const [zip, setZip] = (0, import_react.useState)("/kade.zip");
	(0, import_react.useEffect)(() => {
		setPptx(href("kade-oprichter.pptx"));
		setPdf(href("kade-oprichter.pdf"));
		setZip(href("kade.zip"));
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap gap-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: pptx,
				download: "KADE-voor-de-oprichter.pptx",
				className: "inline-flex min-h-11 items-center rounded-sm bg-brass px-4 text-sm font-medium text-brass-ink",
				children: "PowerPoint"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: pdf,
				target: "_blank",
				rel: "noreferrer",
				className: "inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm",
				children: "Slides"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: zip,
				download: "kade.zip",
				className: "inline-flex min-h-11 items-center rounded-sm bg-brass px-4 text-sm font-medium text-brass-ink",
				children: "kade.zip"
			})
		]
	});
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function Button({ variant = "primary", className, type = "button", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type,
		className: cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40", variant === "primary" ? "bg-brass text-brass-ink hover:bg-ivory" : "border border-line bg-transparent text-ivory hover:border-brass", className),
		...props
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex flex-col gap-1.5 text-sm",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-mist",
			children: label
		}), children]
	});
}
var control = "min-h-11 w-full rounded-sm border border-line bg-ink px-3 text-sm text-ivory outline-none focus:border-brass";
function TextInput(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		...props,
		className: cn(control, props.className)
	});
}
function Area(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		...props,
		className: cn(control, "min-h-28 py-3", props.className)
	});
}
function Select(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
		...props,
		className: cn(control, props.className)
	});
}
function Panel({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		className: cn("rounded-md border border-line bg-panel p-5", className),
		children
	});
}
function Kicker({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-xs font-medium tracking-widest text-brass uppercase",
		children
	});
}
export { Field as a, Select as c, cn as d, deleteDocument as f, useCurrentUserState as g, seedDemo as h, DeckLink as i, TextInput as l, saveDocument as m, BootScreen as n, Kicker as o, getDocument as p, Button as r, Panel as s, Area as t, clearDemo as u };
