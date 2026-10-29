import { r as createServerFn } from "./ssr.mjs";
import { a as daysUntil, f as round2, i as brusselsToday, l as fleetSnapshot, r as authMiddleware } from "./day-BxYy7QRe.mjs";
import { i as isKnownAccount, n as accountKind, r as accountName } from "./accounts-CPuR-Fbz.mjs";
import { c as projectName, o as personName, r as createSsrRpc, s as priorityQueue, u as readFleet } from "./briefing-BKh7ysVD.mjs";
// node_modules/.nitro/vite/services/ssr/assets/ops-shared-D7VxsQv_.js
function lineBase(line) {
	return round2(line.qty * line.unitExVat);
}
function invoiceTotals(lines, forceZeroVat = false) {
	let ex = 0;
	let vat = 0;
	for (const line of lines) {
		const base = lineBase(line);
		const rate = forceZeroVat ? 0 : line.vatRate;
		ex += base;
		vat += round2(base * rate / 100);
	}
	ex = round2(ex);
	vat = round2(vat);
	return {
		ex,
		vat,
		incl: round2(ex + vat)
	};
}
function fiscalYearRange(today, yearEndMonth) {
	const month = today.getMonth() + 1;
	const year = today.getFullYear();
	const endMonth = Math.min(12, Math.max(1, yearEndMonth || 12));
	if (endMonth === 12) return {
		start: `${year}-01-01`,
		end: `${year}-12-31`,
		label: String(year)
	};
	const endYear = month <= endMonth ? year : year + 1;
	const startYear = endYear - 1;
	const startMonth = endMonth + 1;
	const start = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
	const endDay = new Date(endYear, endMonth, 0).getDate();
	return {
		start,
		end: `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
		label: `${startYear}–${endYear}`
	};
}
function inRange(iso, range) {
	return iso >= range.start && iso <= range.end;
}
var MONTHS = [
	"jan",
	"feb",
	"mrt",
	"apr",
	"mei",
	"jun",
	"jul",
	"aug",
	"sep",
	"okt",
	"nov",
	"dec"
];
function netOf(map, code, kind) {
	const row = map.get(code);
	if (!row) return 0;
	const raw = kind === "debit" ? row.debit - row.credit : row.credit - row.debit;
	return round2(raw);
}
function isCompanyForm(form) {
	return form === "bv" || form === "vof" || form === "commv";
}
function estimateTax(profit, directorPay, legalForm) {
	if (profit <= 0) return {
		tax: 0,
		note: "Geen winst, geen vennootschapsbelasting op dit resultaat."
	};
	if (!isCompanyForm(legalForm)) return {
		tax: 0,
		note: "Een eenmanszaak betaalt personenbelasting, geen vennootschapsbelasting. De schijven zijn progressief. KADE rekent hier geen percentage op, dat zou een schijnzekerheid zijn."
	};
	if (directorPay + .005 >= 5e4) {
		const slice = Math.min(profit, 1e5);
		const rest = Math.max(0, profit - 1e5);
		return {
			tax: round2(slice * .2 + rest * .25),
			note: "Kleine vennootschap, bestuurdersbezoldiging minstens 50.000 euro: 20% op de eerste 100.000 winst, 25% daarboven. Boekhoudkundige winst is nog geen belastbare grondslag."
		};
	}
	return {
		tax: round2(profit * .25),
		note: "Zonder bestuurdersbezoldiging van minstens 50.000 euro (2026) valt het verlaagd tarief weg. Dan is het gewone tarief 25% op de hele winst, onder voorbehoud van de andere voorwaarden."
	};
}
function buildSnapshot(journals, company, today = /* @__PURE__ */ new Date()) {
	const range = fiscalYearRange(today, company?.yearEndMonth ?? 12);
	const bs = /* @__PURE__ */ new Map();
	const pnl = /* @__PURE__ */ new Map();
	const prior = /* @__PURE__ */ new Map();
	const monthIncome = /* @__PURE__ */ new Map();
	const monthExpense = /* @__PURE__ */ new Map();
	const add = (map, code, debit, credit) => {
		const row = map.get(code) ?? {
			debit: 0,
			credit: 0
		};
		row.debit = round2(row.debit + debit);
		row.credit = round2(row.credit + credit);
		map.set(code, row);
	};
	for (const journal of journals) {
		const current = inRange(journal.bookedOn, range);
		for (const line of journal.lines) {
			const kind = accountKind(line.account);
			if (kind === "income" || kind === "expense") {
				add(current ? pnl : prior, line.account, line.debit, line.credit);
				if (current) {
					const key = journal.bookedOn.slice(0, 7);
					if (kind === "income") monthIncome.set(key, round2((monthIncome.get(key) ?? 0) + line.credit - line.debit));
					else monthExpense.set(key, round2((monthExpense.get(key) ?? 0) + line.debit - line.credit));
				}
			} else add(bs, line.account, line.debit, line.credit);
		}
	}
	let income = 0;
	let expense = 0;
	for (const [code, row] of pnl) if (accountKind(code) === "income") income = round2(income + row.credit - row.debit);
	else expense = round2(expense + row.debit - row.credit);
	let priorIncome = 0;
	let priorExpense = 0;
	for (const [code, row] of prior) if (accountKind(code) === "income") priorIncome = round2(priorIncome + row.credit - row.debit);
	else priorExpense = round2(priorExpense + row.debit - row.credit);
	const profit = round2(income - expense);
	const priorResult = round2(priorIncome - priorExpense);
	const directorPay = netOf(pnl, "6200", "debit");
	const tax = estimateTax(profit, directorPay, company?.legalForm);
	const assets = [];
	const liabilities = [];
	const equity = [];
	for (const [code, row] of bs) {
		const kind = accountKind(code);
		const name = accountName(code);
		if (kind === "asset") {
			const amount = round2(row.debit - row.credit);
			if (Math.abs(amount) >= .005) assets.push({
				code,
				name,
				amount
			});
		} else if (kind === "liability") {
			const amount = round2(row.credit - row.debit);
			if (Math.abs(amount) >= .005) liabilities.push({
				code,
				name,
				amount
			});
		} else if (kind === "equity") {
			const amount = round2(row.credit - row.debit);
			if (Math.abs(amount) >= .005) equity.push({
				code,
				name,
				amount
			});
		}
	}
	if (Math.abs(priorResult) >= .005) equity.push({
		code: "14xx",
		name: "Resultaat vorige boekjaren",
		amount: priorResult
	});
	assets.sort((a, b) => a.code.localeCompare(b.code));
	liabilities.sort((a, b) => a.code.localeCompare(b.code));
	equity.sort((a, b) => a.code.localeCompare(b.code));
	const sum = (rows) => round2(rows.reduce((s, r) => s + r.amount, 0));
	const assetTotal = sum(assets);
	const liabilityTotal = sum(liabilities);
	const equityTotal = sum(equity);
	const gap = round2(assetTotal - liabilityTotal - equityTotal - profit);
	const expensesByAccount = [...pnl.entries()].filter(([code]) => accountKind(code) === "expense").map(([code, row]) => ({
		code,
		name: accountName(code),
		amount: round2(row.debit - row.credit)
	})).filter((r) => r.amount !== 0).sort((a, b) => b.amount - a.amount);
	const byMonth = [.../* @__PURE__ */ new Set([...monthIncome.keys(), ...monthExpense.keys()])].sort().map((key) => {
		return {
			key,
			label: MONTHS[Number(key.slice(5, 7)) - 1] ?? key,
			income: monthIncome.get(key) ?? 0,
			expense: monthExpense.get(key) ?? 0
		};
	});
	const vatPayable = netOf(bs, "4510", "credit");
	const vatRecoverable = netOf(bs, "4110", "debit");
	return {
		range,
		income,
		expense,
		profit,
		cash: netOf(bs, "5500", "debit"),
		receivables: netOf(bs, "4000", "debit"),
		payables: netOf(bs, "4400", "credit"),
		vatPayable,
		vatRecoverable,
		vatNet: round2(vatPayable - vatRecoverable),
		prepayments: netOf(bs, "4120", "debit"),
		directorPay,
		estimatedTax: tax.tax,
		taxNote: tax.note,
		byMonth,
		expensesByAccount,
		assets,
		liabilities,
		equity,
		assetTotal,
		liabilityTotal,
		equityTotal,
		result: profit,
		priorResult,
		gap
	};
}
function snapshotBrief(snapshot, company, invoices) {
	const open = invoices.filter((i) => i.status === "sent");
	return [
		`Zaak: ${company?.name ?? "nog geen bedrijfsfiche"} (${company?.legalForm ?? "onbekend"}, btw ${company?.vatRegime ?? "onbekend"}, ${company?.activityStatus ?? "statuut onbekend"}).`,
		`Boekjaar ${snapshot.range.label}.`,
		`Omzet ${snapshot.income.toFixed(2)} EUR, kosten ${snapshot.expense.toFixed(2)} EUR, resultaat ${snapshot.profit.toFixed(2)} EUR.`,
		`Bank ${snapshot.cash.toFixed(2)} EUR. Vorderingen ${snapshot.receivables.toFixed(2)} EUR. Leveranciers ${snapshot.payables.toFixed(2)} EUR.`,
		`Btw te betalen ${snapshot.vatPayable.toFixed(2)}, terug te vorderen ${snapshot.vatRecoverable.toFixed(2)}, netto ${snapshot.vatNet.toFixed(2)}.`,
		`Voorafbetalingen ${snapshot.prepayments.toFixed(2)}. Bezoldigingen geboekt ${snapshot.directorPay.toFixed(2)}.`,
		`Geschatte belasting (vereenvoudigd) ${snapshot.estimatedTax.toFixed(2)}. ${snapshot.taxNote}`,
		open.length ? `Openstaande facturen: ${open.map((i) => `${i.number} ${i.clientName} vervalt ${i.dueDate}`).join("; ")}.` : "Geen openstaande facturen."
	].join("\n");
}
function ogmFromSequence(n) {
	const base = String(Math.abs(Math.trunc(n)) % 1e10).padStart(10, "0");
	let mod = 0;
	for (const ch of base) mod = (mod * 10 + Number(ch)) % 97;
	if (mod === 0) mod = 97;
	const full = base + String(mod).padStart(2, "0");
	return `+++${full.slice(0, 3)}/${full.slice(3, 7)}/${full.slice(7)}+++`;
}
function str$1(v, max = 500) {
	return String(v ?? "").trim().slice(0, max);
}
function optDate(v) {
	const s = str$1(v, 10);
	if (!s) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Datum is ongeldig.");
	return s;
}
function asPriority(v) {
	const s = str$1(v, 12);
	return s === "hoog" || s === "laag" ? s : "normaal";
}
function asKind(v) {
	return str$1(v, 8) === "cip" ? "cip" : "todo";
}
function asTaskStatus(v) {
	const s = str$1(v, 12);
	return s === "bezig" || s === "klaar" ? s : "open";
}
function asProjectStatus(v) {
	const s = str$1(v, 12);
	return s === "pauze" || s === "klaar" ? s : "actief";
}
function mapPerson(row) {
	return {
		id: str$1(row.id, 80),
		name: str$1(row.name, 80),
		role: str$1(row.role, 80),
		active: Boolean(row.active)
	};
}
function mapProject(row) {
	return {
		id: str$1(row.id, 80),
		name: str$1(row.name, 140),
		clientName: str$1(row.client_name, 140),
		status: asProjectStatus(row.status),
		note: str$1(row.note, 800),
		dueOn: row.due_on ? str$1(row.due_on, 10) : null,
		createdAt: str$1(row.created_at, 40)
	};
}
function mapTask(row) {
	return {
		id: str$1(row.id, 80),
		projectId: row.project_id ? str$1(row.project_id, 80) : null,
		assigneeId: row.assignee_id ? str$1(row.assignee_id, 80) : null,
		title: str$1(row.title, 180),
		detail: str$1(row.detail, 800),
		kind: asKind(row.kind),
		cause: str$1(row.cause, 800),
		priority: asPriority(row.priority),
		status: asTaskStatus(row.status),
		dueOn: row.due_on ? str$1(row.due_on, 10) : null,
		createdAt: str$1(row.created_at, 40),
		doneAt: row.done_at ? str$1(row.done_at, 40) : null
	};
}
async function readWork(sql, userId) {
	const day = brusselsToday();
	const people = await sql`
    select id, name, role, active from people where user_id = ${userId} order by name asc`;
	const projects = await sql`
    select id, name, client_name, status, note, due_on::text as due_on, created_at::text as created_at
    from projects where user_id = ${userId} order by created_at desc`;
	const tasks = await sql`
    select id, project_id, assignee_id, title, detail, kind, cause, priority, status,
           due_on::text as due_on, created_at::text as created_at, done_at::text as done_at
    from tasks where user_id = ${userId} order by created_at desc`;
	const note = (await sql`
    select day::text as day, body from briefings where user_id = ${userId} and day = ${day}`)[0];
	return {
		people: people.map(mapPerson),
		projects: projects.map(mapProject).sort((a, b) => {
			const order = (s) => s === "actief" ? 0 : s === "pauze" ? 1 : 2;
			return order(a.status) - order(b.status) || a.name.localeCompare(b.name, "nl");
		}),
		tasks: tasks.map(mapTask),
		briefing: note ? {
			day: str$1(note.day, 10),
			body: str$1(note.body, 4e3)
		} : null
	};
}
var savePerson = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const name = str$1(row.name, 80);
	if (!name) throw new Error("Een persoon heeft een naam nodig.");
	return {
		name,
		role: str$1(row.role, 80)
	};
}).handler(createSsrRpc("751fa309157f092200c1bee33eb0ed21247a814ef4702e28aae1fc7214293ad2"));
var setPersonActive = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str$1(row.id, 80);
	if (!id) throw new Error("Persoon ontbreekt.");
	return {
		id,
		active: Boolean(row.active)
	};
}).handler(createSsrRpc("5e8789de9ef9e1bf98030bf4bc569c270a4804a9fd693184f0c91f197f7e38f6"));
var saveProject = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const name = str$1(row.name, 140);
	if (!name) throw new Error("Een project heeft een naam nodig.");
	return {
		id: str$1(row.id, 80),
		name,
		clientName: str$1(row.clientName, 140),
		note: str$1(row.note, 800),
		dueOn: optDate(row.dueOn),
		status: asProjectStatus(row.status)
	};
}).handler(createSsrRpc("d23b9e62f853df49c873b34e0ac11284ee456fe9edb4520f77d617c2d4863670"));
var setProjectStatus = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str$1(row.id, 80);
	if (!id) throw new Error("Project ontbreekt.");
	return {
		id,
		status: asProjectStatus(row.status)
	};
}).handler(createSsrRpc("0992a35239d20903fbb4d64c6ea1d5acc8102302a095f5b0ef1f9164e7823903"));
var saveTask = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const kind = asKind(row.kind);
	const title = str$1(row.title, 180);
	if (!title) throw new Error(kind === "cip" ? "Een CIP heeft een maatregel nodig." : "Een taak heeft een titel nodig.");
	return {
		id: str$1(row.id, 80),
		projectId: str$1(row.projectId, 80),
		assigneeId: str$1(row.assigneeId, 80),
		title,
		detail: str$1(row.detail, 800),
		kind,
		cause: str$1(row.cause, 800),
		priority: asPriority(row.priority),
		dueOn: optDate(row.dueOn)
	};
}).handler(createSsrRpc("dfeb0d2a97fd05cf0764998660c25de14eec77c240aee5510b5478e743e12f55"));
var setTaskStatus = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str$1(row.id, 80);
	if (!id) throw new Error("Taak ontbreekt.");
	return {
		id,
		status: asTaskStatus(row.status)
	};
}).handler(createSsrRpc("b8936f159b38f1d45e4ce39c260ea55e63bf6816fe61350e4b3851b026e08590"));
var deleteTask = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = str$1(input?.id, 80);
	if (!id) throw new Error("Taak ontbreekt.");
	return { id };
}).handler(createSsrRpc("1bd0dfab54d5fb5bb9f602b1936f5be94f08bf24daf482139bc026db938e9ffc"));
var writeMorningBrief = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({ force: Boolean(input?.force) })).handler(createSsrRpc("fbc7e527f325c9c3315edccc0879d8cbc5ee46ab9095a30373a628b64e8c83bd"));
async function db() {
	const { getSql } = await import("./db-BgaupfkL.mjs").then((n) => n.t).then((n) => n.t);
	return getSql();
}
function num(v) {
	const n = typeof v === "number" ? v : Number(v ?? 0);
	return Number.isFinite(n) ? round2(n) : 0;
}
function str(v, max = 500) {
	return String(v ?? "").trim().slice(0, max);
}
function dateStr(v) {
	const s = str(v, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Datum ontbreekt of is ongeldig.");
	return s;
}
function uid() {
	return crypto.randomUUID();
}
function asLines(v) {
	const raw = typeof v === "string" ? JSON.parse(v) : v;
	if (!Array.isArray(raw)) return [];
	return raw.map((row) => {
		const line = row;
		return {
			description: str(line.description, 240),
			qty: num(line.qty) || 0,
			unitExVat: num(line.unitExVat),
			vatRate: [
				0,
				6,
				12,
				21
			].includes(Number(line.vatRate)) ? Number(line.vatRate) : 21
		};
	});
}
function mapParty(row) {
	const days = Math.round(Number(row.pay_days));
	return {
		id: str(row.id, 80),
		name: str(row.name, 160),
		vatNumber: str(row.vat_number, 32),
		email: str(row.email, 160),
		phone: str(row.phone, 40),
		contact: str(row.contact, 80),
		address: str(row.address, 180),
		postalCode: str(row.postal_code, 12),
		city: str(row.city, 80),
		country: str(row.country, 80) || "België",
		payDays: Number.isFinite(days) ? Math.min(180, Math.max(0, days)) : 30,
		iban: str(row.iban, 40),
		note: str(row.note, 800),
		active: row.active == null ? true : Boolean(row.active),
		demo: Boolean(row.demo),
		peppolId: str(row.peppol_id, 60)
	};
}
function mapSupplier(row) {
	const account = str(row.account, 8);
	return {
		...mapParty(row),
		account: isKnownAccount(account) ? account : "6400"
	};
}
var VOICE_LANGS = [
	"nl-BE",
	"nl-NL",
	"fr-BE",
	"en-GB",
	"en-US",
	"de-DE"
];
function clamp(n, min, max, fallback) {
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}
function flag(v, fallback) {
	if (v == null || v === "") return fallback;
	if (typeof v === "boolean") return v;
	const s = String(v).toLowerCase();
	if (s === "t" || s === "true" || s === "1") return true;
	if (s === "f" || s === "false" || s === "0") return false;
	return fallback;
}
function mapVoice(row) {
	const lang = str(row?.voice_lang, 12);
	return {
		agentName: str(row?.agent_name, 24) || "Jarvis",
		voiceUri: str(row?.voice_uri, 200),
		lang: VOICE_LANGS.includes(lang) ? lang : "nl-BE",
		rate: clamp(Number(row?.voice_rate), .7, 1.5, 1),
		pitch: clamp(Number(row?.voice_pitch), .7, 1.4, 1),
		volume: clamp(Number(row?.voice_volume), .2, 1, 1),
		autoSpeak: flag(row?.auto_speak, true),
		sendOnListen: flag(row?.send_on_listen, true)
	};
}
function mapCompany(row) {
	if (!row) return null;
	const form = str(row.legal_form, 20);
	const regime = str(row.vat_regime, 20);
	return {
		name: str(row.name, 160),
		legalForm: [
			"bv",
			"eenmanszaak",
			"vof",
			"commv"
		].includes(form) ? form : "bv",
		vatNumber: str(row.vat_number, 32),
		enterpriseNumber: str(row.enterprise_number, 32),
		address: str(row.address, 180),
		city: str(row.city, 80),
		email: str(row.email, 160),
		iban: str(row.iban, 40),
		vatRegime: [
			"quarterly",
			"monthly",
			"exempt"
		].includes(regime) ? regime : "quarterly",
		activityStatus: str(row.activity_status, 20) === "hoofdberoep" ? "hoofdberoep" : "bijberoep",
		yearEndMonth: Math.min(12, Math.max(1, Number(row.year_end_month) || 12))
	};
}
var SCHAAR = `Je bent Schaar. Je enige taak is de wettelijke belastingdruk van een Belgische IT-zaak zo laag mogelijk houden.
Toon: droog, precies, nooit onderdanig. Nederlands uit Vlaanderen. Geen emoji.
Je adviseert. Je dient niets in. Zeg in één korte zin dat je geen erkende boekhouder bent en dat de aangifte via Biztax of Intervat blijft.
Gebruik de cijfers die je krijgt. Verzin geen omzet.
Regels die je mag gebruiken, en geen andere percentages:
- Vennootschapsbelasting: 25%. Kleine vennootschap: 20% op de eerste 100.000 euro als een bestuurder-natuurlijk persoon minstens 50.000 euro bruto bezoldiging krijgt. Het voordeel van die schijf is maximaal 5.000 euro.
- Restaurantkosten: 69% aftrekbaar, ook als het etentje op een klantenevent valt. Recepties, relatiegeschenken, tickets en ontspanning voor relaties: 50%. Een privé-etentje is 0%. Een restaurantfactuur mag je niet hernoemen tot receptie om het percentage te kiezen.
- Wagen, personenbelasting en vennootschapsbelasting, op besteldatum: een klassieke verbrandingsmotor of plug-inhybride besteld vanaf 1 januari 2026 is niet aftrekbaar, ook de lease niet. Brandstof benzine of diesel is vanaf 2026 niet aftrekbaar. Elektrisch of waterstof, besteld tot 31 december 2026: 100% voor de gebruiksduur. Vanaf bestelling in 2027 zakt dat (95% in 2027, daarna verder). Een wagen besteld tussen 1 juli 2023 en 31 december 2025 dooft uit: 75% in 2026, 50% in 2027, 25% in 2028, 0% in 2029. Voordeel van alle aard bij privégebruik blijft belast bij de gebruiker; in de vennootschap is 17% van dat voordeel een verworpen uitgave.
- Btw op een personenwagen en op restaurant is beperkt of nihil. Noem geen btw-percentage dat hier niet staat.
- Investeringsaftrek, richting 2026, enkel voor wie kwalificeert en niet stapelen op hetzelfde actief: basis 10% voor kmo en zelfstandige, digitale vaste activa 20%, thematisch (energie, emissievrij, milieu, ondersteunend digitaal) 40% voor een kmo. Afschrijven doe je over de gebruiksduur. Een investering telt in het jaar waarin ze in gebruik is.
Horizons als de vraag over tijd gaat: kort is dit boekjaar, midden is een tot drie jaar, lang is daarna.
Nooit voorstellen: een valse factuur, omzet niet boeken, een privé-uitgave als kost, cash zonder stuk, of een kost verzinnen. Als iemand dat vraagt, weiger in één zin.
Structuur: eerst de zet die de druk nu verlaagt, dan wat de fiscus verwerpt, dan kort, midden en lang als dat past. Maximaal tweehonderd woorden.`;
var LOOTS = `Je bent Loots, stuurman van KADE, de zaakterminal van een Belgisch IT-bedrijf.
Toon: droog, precies, licht sarcastisch, nooit onderdanig. Nederlands uit Vlaanderen, geen dialectshow.
Je adviseert over operatie, offertes, research en fiscaliteit.
Als je een fiscale tip geeft, zeg in één korte zin dat je geen erkend boekhouder bent en dat de aangifte via Intervat of Biztax blijft.
Gebruik alleen de cijfers die je krijgt. Verzin geen omzet, geen klanten, geen wetartikelen die je niet zeker weet.
Houd het compact. Geen emoji. Geen aanhef als "Tuurlijk!".`;
async function grok(system, user, maxTokens) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "Geen lijn naar Grok. De boeken werken wel."
	};
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			max_tokens: maxTokens,
			temperature: .4,
			messages: [{
				role: "system",
				content: system
			}, {
				role: "user",
				content: user.slice(0, 12e3)
			}]
		})
	});
	if (!res.ok) return {
		ok: false,
		error: `Grok antwoordde niet (${res.status}). Probeer opnieuw.`
	};
	const text = (await res.json()).choices?.[0]?.message?.content?.trim() ?? "";
	if (!text) return {
		ok: false,
		error: "Grok gaf een leeg antwoord."
	};
	return {
		ok: true,
		text
	};
}
async function readJournals(sql, userId) {
	const journals = await sql`
    select id, booked_on::text as booked_on, memo, source, ref, demo, supplier_id
    from journals where user_id = ${userId} order by booked_on asc, id asc`;
	const lines = await sql`
    select id, journal_id, account, label, debit, credit
    from journal_lines where user_id = ${userId}`;
	const grouped = /* @__PURE__ */ new Map();
	for (const line of lines) {
		const jid = str(line.journal_id, 80);
		const list = grouped.get(jid) ?? [];
		list.push({
			id: str(line.id, 80),
			account: str(line.account, 8),
			label: str(line.label, 120),
			debit: num(line.debit),
			credit: num(line.credit)
		});
		grouped.set(jid, list);
	}
	return journals.map((row) => ({
		id: str(row.id, 80),
		bookedOn: str(row.booked_on, 10),
		memo: str(row.memo, 240),
		source: str(row.source, 40),
		ref: str(row.ref, 80),
		demo: Boolean(row.demo),
		supplierId: row.supplier_id ? str(row.supplier_id, 80) : null,
		lines: grouped.get(str(row.id, 80)) ?? []
	}));
}
async function contextPack(sql, userId) {
	const company = mapCompany((await sql`select * from companies where user_id = ${userId}`)[0]);
	const journals = await readJournals(sql, userId);
	const invoices = (await sql`
    select id, number, client_name, due_date::text as due_date, status
    from invoices where user_id = ${userId}`).map((row) => ({
		id: str(row.id, 80),
		number: str(row.number, 40),
		clientId: null,
		clientName: str(row.client_name, 160),
		clientVat: "",
		clientAddress: "",
		issueDate: "",
		dueDate: str(row.due_date, 10),
		status: str(row.status, 12) || "draft",
		notes: "",
		lines: [],
		demo: false,
		peppolStatus: "concept",
		peppolMessage: ""
	}));
	const snapshot = buildSnapshot(journals, company);
	const day = brusselsToday();
	const work = await readWork(sql, userId);
	const fleet = await readFleet(sql, userId);
	const open = priorityQueue(work.tasks, day).slice(0, 8);
	const fails = fleet.incidents.filter((item) => item.status !== "gesloten").slice(0, 6);
	const watch = fleetSnapshot(fleet.assets, day);
	const clients = await sql`select count(*)::int as n from clients where user_id = ${userId} and active = true`;
	const suppliers = await sql`select count(*)::int as n from suppliers where user_id = ${userId} and active = true`;
	const ops = [
		`Actieve klanten ${clients[0]?.n ?? 0}. Actieve leveranciers ${suppliers[0]?.n ?? 0}.`,
		open.length ? `Open werk: ${open.map((task) => `${task.priority} ${task.kind} ${task.title} (${personName(work.people, task.assigneeId)}, ${projectName(work.projects, task.projectId)})`).join("; ")}.` : "Geen open taken.",
		fails.length ? `Open storingen: ${fails.map((item) => item.title).join("; ")}.` : "Geen open storing.",
		`Eigendom boekwaarde ${watch.book.toFixed(2)} EUR. Lease per maand ${watch.monthlyLease.toFixed(2)} EUR.`,
		watch.ending.length ? `Lease loopt af: ${watch.ending.map((asset) => `${asset.name} op ${asset.endsOn} (${daysUntil(day, asset.endsOn ?? day)} dagen)`).join("; ")}.` : "Geen lease binnen 90 dagen.",
		watch.broken.length ? `Defect: ${watch.broken.map((asset) => asset.name).join("; ")}.` : "Geen defect stuk."
	];
	return {
		company,
		invoices,
		brief: `${snapshotBrief(snapshot, company, invoices)}\n${ops.join("\n")}`
	};
}
var DEFAULT_BOTS = [
	{
		name: "Onderzoeker",
		role: "Research",
		brief: "Zoekt feiten, alternatieven en risico's voor een IT-zaak. Geen verkooppraat. Noem wat je niet zeker weet."
	},
	{
		name: "Offerte",
		role: "Commercieel",
		brief: "Schrijft een strakke offerte: scope, wat er niet in zit, prijslogica, planning, aannames. Vlaams, nuchter."
	},
	{
		name: "Fiscus",
		role: "Fiscaliteit",
		brief: "Leest de cijfers tegen Belgische plichten voor een kleine IT-zaak. Bereidt voor, dient niets in. Waarschuwt als iets een boekhouder nodig heeft."
	},
	{
		name: "Debiteuren",
		role: "Cash",
		brief: "Schrijft een aanmaning die beleefd blijft en toch een datum zet. Geen dreigementen die je niet kunt waarmaken."
	},
	{
		name: "Schaar",
		role: "Fiscaal",
		brief: "Enige taak: de wettelijke belastingdruk zo laag mogelijk. Lease, klantenevent, investeringen op korte, middellange en lange termijn. Geen fraude, geen verzonnen factuur, geen privé als kost. Zegt wat verworpen uitgave is."
	},
	{
		name: "Briefing",
		role: "Operatie",
		brief: "Maakt een ochtendbriefing: kas, open posten, eerstvolgende plicht, één concrete actie. Maximaal twaalf zinnen."
	}
];
function mapMessage(row) {
	return {
		id: str(row.id, 80),
		role: str(row.role, 12) === "assistant" ? "assistant" : "user",
		content: str(row.content, 8e3),
		createdAt: str(row.created_at, 40)
	};
}
async function insertJournal(sql, userId, bookedOn, memo, source, ref, demo, lines, supplierId = null) {
	const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
	const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
	if (Math.abs(debit - credit) > .02) throw new Error("De boeking sluit niet. Debet en credit moeten gelijk zijn.");
	if (!lines.length) throw new Error("Lege boeking.");
	for (const line of lines) if (!isKnownAccount(line.account)) throw new Error(`Onbekende rekening ${line.account}.`);
	const id = uid();
	await sql`
    insert into journals (id, user_id, booked_on, memo, source, ref, demo, supplier_id)
    values (${id}, ${userId}, ${bookedOn}, ${memo}, ${source}, ${ref}, ${demo}, ${supplierId})`;
	for (const line of lines) await sql`
      insert into journal_lines (id, journal_id, user_id, account, label, debit, credit)
      values (${uid()}, ${id}, ${userId}, ${line.account}, ${line.label}, ${line.debit}, ${line.credit})`;
}
async function hasRef(sql, userId, ref) {
	return ((await sql`select count(*)::int as n from journals where user_id = ${userId} and ref = ${ref}`)[0]?.n ?? 0) > 0;
}
export { setProjectStatus as A, ogmFromSequence as C, saveProject as D, savePerson as E, str as M, uid as N, saveTask as O, writeMorningBrief as P, num as S, readWork as T, mapCompany as _, asLines as a, mapSupplier as b, contextPack as c, deleteTask as d, grok as f, isCompanyForm as g, invoiceTotals as h, VOICE_LANGS as i, setTaskStatus as j, setPersonActive as k, dateStr as l, insertJournal as m, LOOTS as n, buildSnapshot as o, hasRef as p, SCHAAR as r, clamp as s, DEFAULT_BOTS as t, db as u, mapMessage as v, readJournals as w, mapVoice as x, mapParty as y };
