import { r as createServerFn } from "./ssr.mjs";
import { r as authMiddleware } from "./day-BxYy7QRe.mjs";
import { C as ogmFromSequence, M as str, N as uid, _ as mapCompany, a as asLines, h as invoiceTotals, l as dateStr, m as insertJournal, p as hasRef, u as db } from "./ops-shared-D7VxsQv_.mjs";
import { t as createServerRpc } from "./createServerRpc-CcwiDFzT.mjs";
// node_modules/.nitro/vite/services/ssr/assets/ops-invoices-DuDDMbn3.js
var saveInvoice_createServerFn_handler = createServerRpc({
	id: "ad767a7253b3f00ecb204d6049a51be2e7b3c90f88b0115b6bd4245b796b94b0",
	name: "saveInvoice",
	filename: "src/lib/ops-invoices.ts"
}, (opts) => saveInvoice.__executeServer(opts));
var saveInvoice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const lines = asLines(row.lines).filter((l) => l.description && l.qty > 0);
	if (!lines.length) throw new Error("Minstens één lijn met omschrijving en aantal.");
	const clientName = str(row.clientName, 160);
	if (!clientName) throw new Error("Zet een klant op de factuur.");
	return {
		id: str(row.id, 80),
		clientId: str(row.clientId, 80),
		clientName,
		clientVat: str(row.clientVat, 32),
		clientAddress: str(row.clientAddress, 200),
		issueDate: dateStr(row.issueDate),
		dueDate: dateStr(row.dueDate),
		notes: str(row.notes, 800),
		lines,
		book: Boolean(row.book)
	};
}).handler(saveInvoice_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	const companies = await sql`select * from companies where user_id = ${userId}`;
	const forceZero = mapCompany(companies[0])?.vatRegime === "exempt";
	const lines = forceZero ? data.lines.map((l) => ({
		...l,
		vatRate: 0
	})) : data.lines;
	const totals = invoiceTotals(lines, forceZero);
	let id = data.id;
	let number = "";
	if (id) {
		const existing = await sql`
        select id, status, number from invoices where id = ${id} and user_id = ${userId}`;
		if (!existing[0]) throw new Error("Factuur niet gevonden.");
		if (str(existing[0].status, 12) !== "draft") throw new Error("Een geboekte factuur wijzig je niet. Maak een creditnota via een nieuwe boeking.");
		number = str(existing[0].number, 40);
		await sql`
        update invoices set client_id = ${data.clientId || null}, client_name = ${data.clientName},
          client_vat = ${data.clientVat}, client_address = ${data.clientAddress},
          issue_date = ${data.issueDate}, due_date = ${data.dueDate}, notes = ${data.notes},
          lines = ${JSON.stringify(lines)}::jsonb, status = ${data.book ? "sent" : "draft"}
        where id = ${id} and user_id = ${userId}`;
	} else {
		const seq = ((await sql`select count(*)::int as n from invoices where user_id = ${userId}`)[0]?.n ?? 0) + 1;
		number = `K-${data.issueDate.slice(0, 4)}-${String(seq).padStart(3, "0")}`;
		id = uid();
		await sql`
        insert into invoices (
          id, user_id, number, client_id, client_name, client_vat, client_address,
          issue_date, due_date, status, notes, lines, demo
        ) values (
          ${id}, ${userId}, ${number}, ${data.clientId || null}, ${data.clientName}, ${data.clientVat}, ${data.clientAddress},
          ${data.issueDate}, ${data.dueDate}, ${data.book ? "sent" : "draft"}, ${data.notes}, ${JSON.stringify(lines)}::jsonb, false
        )`;
	}
	if (data.book) {
		const ref = `inv:${id}:issue`;
		if (!await hasRef(sql, userId, ref)) {
			const note = forceZero ? "Vrijgesteld van btw (kleine onderneming)." : data.notes;
			await insertJournal(sql, userId, data.issueDate, `Factuur ${number} ${data.clientName}`, "invoice", ref, false, [
				{
					account: "4000",
					label: "Klant",
					debit: totals.incl,
					credit: 0
				},
				{
					account: "7000",
					label: "Omzet",
					debit: 0,
					credit: totals.ex
				},
				...totals.vat > 0 ? [{
					account: "4510",
					label: "Btw",
					debit: 0,
					credit: totals.vat
				}] : []
			]);
			if (note && forceZero) await sql`update invoices set notes = ${note} where id = ${id} and user_id = ${userId} and notes = ''`;
		}
	}
	return {
		id,
		number,
		ogm: ogmFromSequence(Number(number.replace(/\D/g, "")) || 1)
	};
});
var setInvoicePaid_createServerFn_handler = createServerRpc({
	id: "ff9f12ae4dbcb86e92da6a4f581efd6bc094a129b75ecbed89adb5059d72eacd",
	name: "setInvoicePaid",
	filename: "src/lib/ops-invoices.ts"
}, (opts) => setInvoicePaid.__executeServer(opts));
var setInvoicePaid = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = str(input?.id, 80);
	const paidOn = dateStr(input?.paidOn);
	if (!id) throw new Error("Factuur ontbreekt.");
	return {
		id,
		paidOn
	};
}).handler(setInvoicePaid_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	const row = (await sql`
      select id, number, status, lines, client_name from invoices where id = ${data.id} and user_id = ${userId}`)[0];
	if (!row) throw new Error("Factuur niet gevonden.");
	if (str(row.status, 12) === "draft") throw new Error("Boek de factuur eerst als verstuurd.");
	if (str(row.status, 12) === "paid") return { ok: true };
	const companies = await sql`select vat_regime from companies where user_id = ${userId}`;
	const forceZero = str(companies[0]?.vat_regime, 20) === "exempt";
	const totals = invoiceTotals(asLines(row.lines), forceZero);
	const ref = `inv:${data.id}:pay`;
	if (!await hasRef(sql, userId, ref)) await insertJournal(sql, userId, data.paidOn, `Ontvangst ${str(row.number, 40)} ${str(row.client_name, 80)}`, "invoice", ref, false, [{
		account: "5500",
		label: "Bank",
		debit: totals.incl,
		credit: 0
	}, {
		account: "4000",
		label: "Klant",
		debit: 0,
		credit: totals.incl
	}]);
	await sql`update invoices set status = 'paid' where id = ${data.id} and user_id = ${userId}`;
	return { ok: true };
});
var deleteDraftInvoice_createServerFn_handler = createServerRpc({
	id: "3756ceb9593f29c18ab73dbd8188c4a0011596fe0147c1b4d49e9b0d592a2112",
	name: "deleteDraftInvoice",
	filename: "src/lib/ops-invoices.ts"
}, (opts) => deleteDraftInvoice.__executeServer(opts));
var deleteDraftInvoice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => str(input?.id, 80)).handler(deleteDraftInvoice_createServerFn_handler, async ({ context, data: id }) => {
	await (await db())`delete from invoices where id = ${id} and user_id = ${context.userId} and status = 'draft'`;
	return { ok: true };
});
export { deleteDraftInvoice_createServerFn_handler, saveInvoice_createServerFn_handler, setInvoicePaid_createServerFn_handler };
