import { o as __toESM } from "../_runtime.mjs";
import { G as require_react, b as require_jsx_runtime, v as Navigate, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as signIn, r as rememberBearer, t as authClient } from "./client-B6x-1vPk.mjs";
import { t as GROK_PROVIDERS } from "./server-DaDAEmBs.mjs";
import { a as Field, g as useCurrentUserState, h as seedDemo, i as DeckLink, l as TextInput, n as BootScreen, r as Button } from "./ui-BZXg77Zv.mjs";
// node_modules/.nitro/vite/services/ssr/assets/login-CU_ZRrq9.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function LoginRoute() {
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setReady(true), []);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BootScreen, { label: "Sessie nakijken" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoginGate, {});
}
function LoginGate() {
	const { user, isPending } = useCurrentUserState();
	if (isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BootScreen, { label: "Sessie nakijken" });
	if (user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to: "/" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoginScreen, {});
}
var DEMO_EMAIL = "demo@noorderlicht.example";
var DEMO_PASSWORD = "kade-demo-kijken";
function keepToken(ctx) {
	const token = ctx.response.headers.get("set-auth-token");
	if (token) rememberBearer(token);
}
function LoginScreen() {
	const router = useRouter();
	const [mode, setMode] = (0, import_react.useState)("in");
	const [name, setName] = (0, import_react.useState)("");
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	async function enterDemo() {
		setBusy(true);
		setError("");
		const fetchOptions = { onSuccess: keepToken };
		const signedIn = await authClient.signIn.email({
			email: DEMO_EMAIL,
			password: DEMO_PASSWORD,
			fetchOptions
		});
		const opened = signedIn.error ? await authClient.signUp.email({
			email: DEMO_EMAIL,
			password: DEMO_PASSWORD,
			name: "Demo",
			fetchOptions
		}) : signedIn;
		if (opened.error) {
			setBusy(false);
			setError(opened.error.message || "De demo ging niet open.");
			return;
		}
		try {
			await seedDemo();
		} catch {}
		await router.navigate({ to: "/" });
	}
	async function onSubmit(event) {
		event.preventDefault();
		setBusy(true);
		setError("");
		const result = mode === "up" ? await authClient.signUp.email({
			email,
			password,
			name: name || email,
			callbackURL: "/"
		}) : await authClient.signIn.email({
			email,
			password,
			callbackURL: "/"
		});
		setBusy(false);
		if (result.error) {
			setError(result.error.message || "Aanmelden lukte niet.");
			return;
		}
		await router.navigate({ to: "/" });
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "grid min-h-screen bg-ink text-ivory lg:grid-cols-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "flex flex-col justify-between border-b border-line px-6 py-8 lg:border-r lg:border-b-0 lg:px-12 lg:py-12",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium tracking-widest text-brass uppercase",
					children: "Zaakterminal"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display text-6xl leading-none sm:text-8xl",
						children: "KADE"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-6 max-w-md text-lg text-mist text-pretty",
						children: "Boeken, facturen, bonnen en een stuurman die de Belgische kalender niet vergeet. Afgeschermd per account."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-8",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeckLink, {})
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-10 text-sm text-mist",
					children: "Antwerpen · IT · dubbele boekhouding"
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "flex items-center px-6 py-10 lg:px-16",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "w-full max-w-md",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-4xl",
						children: mode === "in" ? "Binnenkomen" : "Account openen"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-mist",
						children: "Demo zonder account, of aanmelden voor je eigen cijfers."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							disabled: busy,
							onClick: () => void enterDemo(),
							children: busy ? "Demo opent…" : "Demo bekijken"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm text-mist",
							children: "Geen e-mail, geen wachtwoord. Je komt in het demoboekjaar."
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-6 flex flex-col gap-2 border-t border-line pt-6",
						children: GROK_PROVIDERS.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "ghost",
							onClick: () => signIn(provider.providerId, { callbackURL: "/" }),
							children: ["Doorgaan met ", provider.label]
						}, provider.providerId))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit,
						className: "mt-6 flex flex-col gap-3 border-t border-line pt-6",
						children: [
							mode === "up" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Naam",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, {
									value: name,
									onChange: (e) => setName(e.target.value),
									autoComplete: "name"
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "E-mail",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, {
									type: "email",
									required: true,
									value: email,
									onChange: (e) => setEmail(e.target.value),
									autoComplete: "email"
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Wachtwoord",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, {
									type: "password",
									required: true,
									minLength: 8,
									value: password,
									onChange: (e) => setPassword(e.target.value),
									autoComplete: mode === "up" ? "new-password" : "current-password"
								})
							}),
							error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-brass",
								children: error
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "submit",
								disabled: busy,
								children: busy ? "Bezig…" : mode === "in" ? "Aanmelden" : "Account maken"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "min-h-11 text-sm text-mist underline-offset-4 hover:text-ivory hover:underline",
								onClick: () => {
									setMode(mode === "in" ? "up" : "in");
									setError("");
								},
								children: mode === "in" ? "Nog geen account" : "Ik heb al een account"
							})
						]
					})
				]
			})
		})]
	});
}
export { LoginRoute as component };
