import { r as createServerFn } from "./ssr.mjs";
import { r as authMiddleware } from "./day-BxYy7QRe.mjs";
import { i as isKnownAccount } from "./accounts-CPuR-Fbz.mjs";
import { M as str, N as uid, u as db } from "./ops-shared-D7VxsQv_.mjs";
import { t as createServerRpc } from "./createServerRpc-CcwiDFzT.mjs";
// node_modules/.nitro/vite/services/ssr/assets/ops-parties-Dnf0ttpu.js
var saveClient_createServerFn_handler = createServerRpc({
	id: "a3b0efeb447e4e679a370231a4e8fcdbe1c05a55ffd736698bd3c9a7452beb14",
	name: "saveClient",
	filename: "src/lib/ops-parties.ts"
}, (opts) => saveClient.__executeServer(opts));
var saveClient = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => partyInput(input, "klant")).handler(saveClient_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const id = data.id || uid();
	if (data.id) {
		if (!(await sql`select id from clients where id = ${id} and user_id = ${context.userId}`)[0]) throw new Error("Klant niet gevonden.");
		await sql`
        update clients set name = ${data.name}, vat_number = ${data.vatNumber}, email = ${data.email},
          phone = ${data.phone}, contact = ${data.contact}, address = ${data.address}, postal_code = ${data.postalCode},
          city = ${data.city}, country = ${data.country}, pay_days = ${data.payDays}, iban = ${data.iban}, note = ${data.note},
          active = ${data.active}, peppol_id = ${data.peppolId}
        where id = ${id} and user_id = ${context.userId}`;
	} else await sql`
        insert into clients (
          id, user_id, name, vat_number, email, phone, contact, address, postal_code, city, country,
          pay_days, iban, note, active, demo, peppol_id
        ) values (
          ${id}, ${context.userId}, ${data.name}, ${data.vatNumber}, ${data.email}, ${data.phone}, ${data.contact},
          ${data.address}, ${data.postalCode}, ${data.city}, ${data.country}, ${data.payDays}, ${data.iban},
          ${data.note}, ${data.active}, false, ${data.peppolId}
        )`;
	return { id };
});
var saveSupplier_createServerFn_handler = createServerRpc({
	id: "65eed614840a53b82c12e095631c48c310d0e983b46bb4e1878d6b6679a68ea7",
	name: "saveSupplier",
	filename: "src/lib/ops-parties.ts"
}, (opts) => saveSupplier.__executeServer(opts));
var saveSupplier = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const party = partyInput(input, "leverancier");
	const account = str(input?.account, 8) || "6400";
	if (!isKnownAccount(account) || !account.startsWith("6")) throw new Error("Kies een kostenrekening.");
	return {
		...party,
		account
	};
}).handler(saveSupplier_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const id = data.id || uid();
	if (data.id) {
		if (!(await sql`select id from suppliers where id = ${id} and user_id = ${context.userId}`)[0]) throw new Error("Leverancier niet gevonden.");
		await sql`
        update suppliers set name = ${data.name}, vat_number = ${data.vatNumber}, email = ${data.email},
          phone = ${data.phone}, contact = ${data.contact}, address = ${data.address}, postal_code = ${data.postalCode},
          city = ${data.city}, country = ${data.country}, pay_days = ${data.payDays}, iban = ${data.iban},
          account = ${data.account}, note = ${data.note}, active = ${data.active}
        where id = ${id} and user_id = ${context.userId}`;
	} else await sql`
        insert into suppliers (
          id, user_id, name, vat_number, email, phone, contact, address, postal_code, city, country,
          pay_days, iban, account, note, active
        ) values (
          ${id}, ${context.userId}, ${data.name}, ${data.vatNumber}, ${data.email}, ${data.phone}, ${data.contact},
          ${data.address}, ${data.postalCode}, ${data.city}, ${data.country}, ${data.payDays}, ${data.iban},
          ${data.account}, ${data.note}, ${data.active}
        )`;
	return { id };
});
var setPartyActive_createServerFn_handler = createServerRpc({
	id: "f629c22a2cb133ccede5c7d43d3a5f274a1501a7c8a58ddc104f05e664a9110f",
	name: "setPartyActive",
	filename: "src/lib/ops-parties.ts"
}, (opts) => setPartyActive.__executeServer(opts));
var setPartyActive = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str(row.id, 80);
	if (!id) throw new Error("Relatie ontbreekt.");
	return {
		id,
		kind: row.kind === "supplier" ? "supplier" : "client",
		active: Boolean(row.active)
	};
}).handler(setPartyActive_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	if (data.kind === "supplier") await sql`update suppliers set active = ${data.active} where id = ${data.id} and user_id = ${context.userId}`;
	else await sql`update clients set active = ${data.active} where id = ${data.id} and user_id = ${context.userId}`;
	return { ok: true };
});
var deleteParty_createServerFn_handler = createServerRpc({
	id: "95437ed89329ca533b8cec550b6693baa5cf5ae2bbecce54b5e8911e2d741408",
	name: "deleteParty",
	filename: "src/lib/ops-parties.ts"
}, (opts) => deleteParty.__executeServer(opts));
var deleteParty = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str(row.id, 80);
	if (!id) throw new Error("Relatie ontbreekt.");
	return {
		id,
		kind: row.kind === "supplier" ? "supplier" : "client"
	};
}).handler(deleteParty_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	if (data.kind === "client") {
		if (((await sql`
        select count(*)::int as n from invoices where user_id = ${userId} and client_id = ${data.id}`)[0]?.n ?? 0) > 0) throw new Error("Deze klant heeft facturen. Zet hem op non-actief.");
		await sql`update documents set client_id = null where client_id = ${data.id} and user_id = ${userId}`;
		await sql`delete from clients where id = ${data.id} and user_id = ${userId}`;
	} else {
		if (((await sql`
        select count(*)::int as n from journals where user_id = ${userId} and supplier_id = ${data.id}`)[0]?.n ?? 0) > 0) throw new Error("Deze leverancier heeft boekingen. Zet hem op non-actief.");
		await sql`update documents set supplier_id = null where supplier_id = ${data.id} and user_id = ${userId}`;
		await sql`delete from suppliers where id = ${data.id} and user_id = ${userId}`;
	}
	return { ok: true };
});
function partyInput(input, who) {
	const row = input ?? {};
	const name = str(row.name, 160);
	if (!name) throw new Error(`De ${who} heeft een naam nodig.`);
	const payDays = Math.round(Number(row.payDays));
	return {
		id: str(row.id, 80),
		name,
		vatNumber: str(row.vatNumber, 32).toUpperCase(),
		email: str(row.email, 160),
		phone: str(row.phone, 40),
		contact: str(row.contact, 80),
		address: str(row.address, 180),
		postalCode: str(row.postalCode, 12),
		city: str(row.city, 80),
		country: str(row.country, 80) || "België",
		payDays: Number.isFinite(payDays) ? Math.min(180, Math.max(0, payDays)) : 30,
		iban: str(row.iban, 40).replace(/\s+/g, "").toUpperCase(),
		note: str(row.note, 800),
		active: row.active == null ? true : Boolean(row.active),
		peppolId: str(row.peppolId, 60).replace(/\s+/g, "")
	};
}
export { deleteParty_createServerFn_handler, saveClient_createServerFn_handler, saveSupplier_createServerFn_handler, setPartyActive_createServerFn_handler };
