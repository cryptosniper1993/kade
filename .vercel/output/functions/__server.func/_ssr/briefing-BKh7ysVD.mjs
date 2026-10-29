import { a as getServerFnById, i as TSS_SERVER_FUNCTION, r as createServerFn } from "./ssr.mjs";
import { f as round2, i as brusselsToday, r as authMiddleware } from "./day-BxYy7QRe.mjs";
// node_modules/.nitro/vite/services/ssr/assets/briefing-BKh7ysVD.js
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
function str(v, max = 500) {
	return String(v ?? "").trim().slice(0, max);
}
function num(v) {
	const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
	return Number.isFinite(n) ? round2(n) : 0;
}
function optDate(v) {
	const s = str(v, 10);
	if (!s) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Datum is ongeldig.");
	return s;
}
function asKind(v) {
	return str(v, 12) === "lease" ? "lease" : "eigendom";
}
function asCategory(v) {
	const s = str(v, 20);
	if (s === "wagen" || s === "software" || s === "kantoor" || s === "overig") return s;
	return "hardware";
}
function asStatus(v) {
	const s = str(v, 12);
	if (s === "reserve" || s === "defect" || s === "einde") return s;
	return "gebruik";
}
function asIncidentStatus(v) {
	const s = str(v, 12);
	if (s === "opvolging" || s === "gesloten") return s;
	return "open";
}
function mapAsset(row) {
	return {
		id: str(row.id, 80),
		name: str(row.name, 140),
		kind: asKind(row.kind),
		category: asCategory(row.category),
		ref: str(row.ref, 80),
		vendor: str(row.vendor, 140),
		acquiredOn: row.acquired_on ? str(row.acquired_on, 10) : null,
		endsOn: row.ends_on ? str(row.ends_on, 10) : null,
		amountEur: num(row.amount_eur),
		residualEur: num(row.residual_eur),
		lifeMonths: Math.max(1, Math.min(240, Number(row.life_months) || 36)),
		status: asStatus(row.status),
		holderId: row.holder_id ? str(row.holder_id, 80) : null,
		projectId: row.project_id ? str(row.project_id, 80) : null,
		note: str(row.note, 800)
	};
}
function mapIncident(row) {
	return {
		id: str(row.id, 80),
		assetId: row.asset_id ? str(row.asset_id, 80) : null,
		projectId: row.project_id ? str(row.project_id, 80) : null,
		taskId: row.task_id ? str(row.task_id, 80) : null,
		title: str(row.title, 180),
		detail: str(row.detail, 800),
		severity: str(row.severity, 12) === "normaal" ? "normaal" : "hoog",
		status: asIncidentStatus(row.status),
		happenedOn: row.happened_on ? str(row.happened_on, 10) : null,
		createdAt: str(row.created_at, 40)
	};
}
async function readFleet(sql, userId) {
	const assets = await sql`
    select id, name, kind, category, ref, vendor, acquired_on::text as acquired_on, ends_on::text as ends_on,
           amount_eur, residual_eur, life_months, status, holder_id, project_id, note
    from assets where user_id = ${userId} order by name asc`;
	const incidents = await sql`
    select id, asset_id, project_id, task_id, title, detail, severity, status,
           happened_on::text as happened_on, created_at::text as created_at
    from incidents where user_id = ${userId} order by created_at desc`;
	const order = (s) => s === "defect" ? 0 : s === "gebruik" ? 1 : s === "reserve" ? 2 : 3;
	return {
		assets: assets.map(mapAsset).sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name, "nl")),
		incidents: incidents.map(mapIncident)
	};
}
var saveAsset = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const name = str(row.name, 140);
	if (!name) throw new Error("Een stuk heeft een naam nodig.");
	const kind = asKind(row.kind);
	const amountEur = num(row.amountEur);
	if (amountEur < 0) throw new Error("Een bedrag is niet negatief.");
	const residualEur = kind === "lease" ? 0 : num(row.residualEur);
	if (residualEur < 0 || residualEur > amountEur) throw new Error("De restwaarde zit tussen nul en de aanschaf.");
	const life = kind === "lease" ? 1 : Math.max(1, Math.min(240, Math.round(Number(row.lifeMonths) || 36)));
	return {
		id: str(row.id, 80),
		name,
		kind,
		category: asCategory(row.category),
		ref: str(row.ref, 80),
		vendor: str(row.vendor, 140),
		acquiredOn: optDate(row.acquiredOn),
		endsOn: optDate(row.endsOn),
		amountEur,
		residualEur,
		lifeMonths: life,
		status: asStatus(row.status),
		holderId: str(row.holderId, 80),
		projectId: str(row.projectId, 80),
		note: str(row.note, 800)
	};
}).handler(createSsrRpc("2d8b24f764f3886952c09209854562761201f2e941a3bde8560d368d08f2fb45"));
var deleteAsset = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = str(input?.id, 80);
	if (!id) throw new Error("Stuk ontbreekt.");
	return { id };
}).handler(createSsrRpc("d3c0a3a5ffbb657ca774263362b4eeada338d2998ed205b3de5f2df8cd02f527"));
var bookAssetPurchase = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = str(input?.id, 80);
	if (!id) throw new Error("Stuk ontbreekt.");
	return { id };
}).handler(createSsrRpc("33ecf298b73b4edf75bcb5bc05d6eb84febb3aadfebcd88760aaace28dd04f3f"));
var bookDepreciation = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("e756f30e02f2866d5c48defbf82a4400266794fe0f1bf6adafafe3873ae76637"));
var saveIncident = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const title = str(row.title, 180);
	if (!title) throw new Error("Een storing heeft een naam nodig.");
	return {
		title,
		detail: str(row.detail, 800),
		assetId: str(row.assetId, 80),
		projectId: str(row.projectId, 80),
		severity: str(row.severity, 12) === "normaal" ? "normaal" : "hoog",
		happenedOn: optDate(row.happenedOn) ?? brusselsToday()
	};
}).handler(createSsrRpc("f78f731822e5c48567f855644c9dbcd17d62777419e8344aa61c2d9f11469f7d"));
var setIncidentStatus = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str(row.id, 80);
	if (!id) throw new Error("Storing ontbreekt.");
	return {
		id,
		status: asIncidentStatus(row.status)
	};
}).handler(createSsrRpc("310d49699111943663222d2ecd35dc872c65f9e7e404ba2a11c78153a72de935"));
function personName(people, id) {
	if (!id) return "Niet toegewezen";
	return people.find((person) => person.id === id)?.name ?? "Onbekend";
}
function projectName(projects, id) {
	if (!id) return "Los";
	return projects.find((project) => project.id === id)?.name ?? "Project weg";
}
function isOpen(task) {
	return task.status !== "klaar";
}
function isLate(task, today) {
	return isOpen(task) && Boolean(task.dueOn) && task.dueOn < today;
}
function taskRank(task, today) {
	const priority = task.priority === "hoog" ? 0 : task.priority === "normaal" ? 1 : 2;
	const due = !task.dueOn ? 3 : task.dueOn < today ? 0 : task.dueOn === today ? 1 : 2;
	const cip = task.kind === "cip" ? 0 : 1;
	return priority * 20 + due * 2 + cip;
}
function priorityQueue(tasks, today) {
	return tasks.filter(isOpen).slice().sort((a, b) => {
		const rank = taskRank(a, today) - taskRank(b, today);
		if (rank !== 0) return rank;
		return (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99");
	});
}
function projectProgress(tasks, projectId) {
	const mine = tasks.filter((task) => task.projectId === projectId);
	const total = mine.length;
	const done = mine.filter((task) => task.status === "klaar").length;
	return {
		done,
		total,
		pct: total === 0 ? 0 : Math.round(done / total * 100)
	};
}
export { isLate as a, projectName as c, saveAsset as d, saveIncident as f, deleteAsset as i, projectProgress as l, bookDepreciation as n, personName as o, setIncidentStatus as p, createSsrRpc as r, priorityQueue as s, bookAssetPurchase as t, readFleet as u };
