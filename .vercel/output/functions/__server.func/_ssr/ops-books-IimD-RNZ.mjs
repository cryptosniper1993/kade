import { r as createServerFn } from "./ssr.mjs";
import { f as round2, r as authMiddleware } from "./day-BxYy7QRe.mjs";
import { i as isKnownAccount, r as accountName } from "./accounts-CPuR-Fbz.mjs";
import { M as str, S as num, l as dateStr, m as insertJournal, u as db } from "./ops-shared-D7VxsQv_.mjs";
import { t as createServerRpc } from "./createServerRpc-CcwiDFzT.mjs";
// node_modules/.nitro/vite/services/ssr/assets/ops-books-IimD-RNZ.js
var postEntry_createServerFn_handler = createServerRpc({
	id: "169788d3137048773583b296f0b44bf1515ac99b61e4f2643cb1b06c047c6499",
	name: "postEntry",
	filename: "src/lib/ops-books.ts"
}, (opts) => postEntry.__executeServer(opts));
var postEntry = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const kind = str(row.kind, 20);
	const date = dateStr(row.date);
	if (kind === "expense" || kind === "asset") {
		const account = kind === "asset" ? "2400" : str(row.account, 8);
		if (!isKnownAccount(account) || kind === "expense" && !account.startsWith("6")) throw new Error("Kies een kostenrekening.");
		const amountEx = num(row.amountEx);
		if (amountEx <= 0) throw new Error("Bedrag moet groter zijn dan nul.");
		const vatRate = [
			0,
			6,
			12,
			21
		].includes(Number(row.vatRate)) ? Number(row.vatRate) : 21;
		const memo = str(row.memo, 180) || accountName(account);
		if (kind === "expense") return {
			kind: "expense",
			date,
			memo,
			account,
			amountEx,
			vatRate,
			paid: row.paid !== false,
			supplierId: str(row.supplierId, 80)
		};
		return {
			kind: "asset",
			date,
			memo,
			account,
			amountEx,
			vatRate,
			paid: true
		};
	}
	if (kind === "prepay" || kind === "capital") {
		const amount = num(row.amount);
		if (amount <= 0) throw new Error("Bedrag moet groter zijn dan nul.");
		return {
			kind,
			date,
			amount
		};
	}
	if (kind === "salary") {
		const amount = num(row.amount);
		if (amount <= 0) throw new Error("Bedrag moet groter zijn dan nul.");
		return {
			kind: "salary",
			date,
			memo: str(row.memo, 180) || "Bezoldiging",
			amount
		};
	}
	throw new Error("Onbekend boekstuk.");
}).handler(postEntry_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	if (data.kind === "expense" || data.kind === "asset") {
		const companies = await sql`select vat_regime from companies where user_id = ${userId}`;
		const rate = str(companies[0]?.vat_regime, 20) === "exempt" ? 0 : data.vatRate;
		const vat = round2(data.amountEx * rate / 100);
		const incl = round2(data.amountEx + vat);
		const creditAccount = data.kind === "expense" && !data.paid ? "4400" : "5500";
		let supplierId = null;
		if (data.kind === "expense" && data.supplierId) {
			if (!(await sql`select id from suppliers where id = ${data.supplierId} and user_id = ${userId}`)[0]) throw new Error("Leverancier niet gevonden.");
			supplierId = data.supplierId;
		}
		await insertJournal(sql, userId, data.date, data.memo, "manual", "", false, [
			{
				account: data.account,
				label: accountName(data.account),
				debit: data.amountEx,
				credit: 0
			},
			...vat > 0 ? [{
				account: "4110",
				label: "Btw aftrek",
				debit: vat,
				credit: 0
			}] : [],
			{
				account: creditAccount,
				label: creditAccount === "5500" ? "Bank" : "Leverancier",
				debit: 0,
				credit: incl
			}
		], supplierId);
		return { ok: true };
	}
	if (data.kind === "prepay") {
		await insertJournal(sql, userId, data.date, "Voorafbetaling vennootschapsbelasting", "manual", "", false, [{
			account: "4120",
			label: "Voorafbetaling",
			debit: data.amount,
			credit: 0
		}, {
			account: "5500",
			label: "Bank",
			debit: 0,
			credit: data.amount
		}]);
		return { ok: true };
	}
	if (data.kind === "salary") {
		await insertJournal(sql, userId, data.date, data.memo, "manual", "", false, [{
			account: "6200",
			label: "Bezoldiging",
			debit: data.amount,
			credit: 0
		}, {
			account: "5500",
			label: "Bank",
			debit: 0,
			credit: data.amount
		}]);
		return { ok: true };
	}
	await insertJournal(sql, userId, data.date, "Inbreng op de zaakrekening", "manual", "", false, [{
		account: "5500",
		label: "Bank",
		debit: data.amount,
		credit: 0
	}, {
		account: "1000",
		label: "Inbreng",
		debit: 0,
		credit: data.amount
	}]);
	return { ok: true };
});
var deleteJournal_createServerFn_handler = createServerRpc({
	id: "dddd0a77fb88e4ccdd595aba299076e535c964157ce9989de20fc6564f104024",
	name: "deleteJournal",
	filename: "src/lib/ops-books.ts"
}, (opts) => deleteJournal.__executeServer(opts));
var deleteJournal = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => str(input?.id, 80)).handler(deleteJournal_createServerFn_handler, async ({ context, data: id }) => {
	const sql = await db();
	const rows = await sql`select source from journals where id = ${id} and user_id = ${context.userId}`;
	if (!rows[0]) return {
		ok: false,
		error: "Boeking niet gevonden."
	};
	if (rows[0].source === "invoice") return {
		ok: false,
		error: "Factuurboekingen verwijder je niet apart."
	};
	await sql`delete from journal_lines where journal_id = ${id} and user_id = ${context.userId}`;
	await sql`delete from journals where id = ${id} and user_id = ${context.userId}`;
	return { ok: true };
});
export { deleteJournal_createServerFn_handler, postEntry_createServerFn_handler };
