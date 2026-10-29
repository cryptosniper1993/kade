import { r as createServerFn } from "./ssr.mjs";
import { r as authMiddleware } from "./day-BxYy7QRe.mjs";
import { M as str, N as uid, c as contextPack, f as grok, i as VOICE_LANGS, n as LOOTS, r as SCHAAR, s as clamp, u as db } from "./ops-shared-D7VxsQv_.mjs";
import { t as createServerRpc } from "./createServerRpc-CcwiDFzT.mjs";
// node_modules/.nitro/vite/services/ssr/assets/ops-agents-Cl2AwTqf.js
var saveBot_createServerFn_handler = createServerRpc({
	id: "d63532c631b3e414d04eb215f13f63ce8e22f3e6bdf639a5805777e53d9437de",
	name: "saveBot",
	filename: "src/lib/ops-agents.ts"
}, (opts) => saveBot.__executeServer(opts));
var saveBot = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const name = str(row.name, 80);
	if (!name) throw new Error("De bot heeft een naam nodig.");
	return {
		id: str(row.id, 80),
		name,
		role: str(row.role, 60) || "Algemeen",
		brief: str(row.brief, 600),
		task: str(row.task, 2e3),
		followed: Boolean(row.followed)
	};
}).handler(saveBot_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	if (data.id) {
		await sql`
        update bots set name = ${data.name}, role = ${data.role}, brief = ${data.brief},
          task = ${data.task}, followed = ${data.followed}, updated_at = now()
        where id = ${data.id} and user_id = ${context.userId}`;
		return { id: data.id };
	}
	const id = uid();
	await sql`
      insert into bots (id, user_id, name, role, brief, task, followed)
      values (${id}, ${context.userId}, ${data.name}, ${data.role}, ${data.brief}, ${data.task}, ${data.followed})`;
	return { id };
});
var deleteBot_createServerFn_handler = createServerRpc({
	id: "1363afb34c753fb51c0292ca184ebe30a7b2ff94547bdc3bb503f043b100786e",
	name: "deleteBot",
	filename: "src/lib/ops-agents.ts"
}, (opts) => deleteBot.__executeServer(opts));
var deleteBot = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => str(input?.id, 80)).handler(deleteBot_createServerFn_handler, async ({ context, data: id }) => {
	await (await db())`delete from bots where id = ${id} and user_id = ${context.userId}`;
	return { ok: true };
});
var runBot_createServerFn_handler = createServerRpc({
	id: "f53926ce5c42dc3e7111bf061f2d4aa58ef41bd00800a7f243c955605b7f0ed4",
	name: "runBot",
	filename: "src/lib/ops-agents.ts"
}, (opts) => runBot.__executeServer(opts));
var runBot = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const id = str(row.id, 80);
	const task = str(row.task, 2e3);
	if (!id || !task) throw new Error("Kies een bot en geef hem een opdracht.");
	return {
		id,
		task
	};
}).handler(runBot_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const rows = await sql`
      select name, role, brief from bots where id = ${data.id} and user_id = ${context.userId}`;
	if (!rows[0]) throw new Error("Bot niet gevonden.");
	const pack = await contextPack(sql, context.userId);
	const name = str(rows[0].name, 80);
	const system = name === "Schaar" ? SCHAAR : `${LOOTS}\nJe voert nu één bot uit.\nNaam: ${name}\nRol: ${str(rows[0].role, 60)}\nOpdrachtkader: ${str(rows[0].brief, 600)}`;
	const answer = await grok(system, `Cijfers van de zaak:\n${pack.brief}\n\nOpdracht:\n${data.task}`, 700);
	const text = answer.ok ? answer.text : answer.error;
	await sql`
      update bots set task = ${data.task}, last_result = ${text}, status = ${answer.ok ? "klaar" : "fout"}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}`;
	await sql`
      insert into bot_runs (id, user_id, bot_id, bot_name, task, result)
      values (${uid()}, ${context.userId}, ${data.id}, ${name}, ${data.task}, ${text})`;
	return answer;
});
var askLoots_createServerFn_handler = createServerRpc({
	id: "415e6d556885b69fa07e8bc097a3539f39b7aa9aeca0b16e4eb133a9cb2d082e",
	name: "askLoots",
	filename: "src/lib/ops-agents.ts"
}, (opts) => askLoots.__executeServer(opts));
var askLoots = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const text = str(input?.text, 4e3);
	if (!text) throw new Error("Zeg iets tegen Loots.");
	return { text };
}).handler(askLoots_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	await sql`
      insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'user', ${data.text}, 'loots')`;
	const history = await sql`
      select role, content from agent_messages where user_id = ${userId} and channel = 'loots' order by created_at desc limit 8`;
	const pack = await contextPack(sql, userId);
	const thread = history.reverse().map((m) => `${m.role === "assistant" ? "Loots" : "Jij"}: ${m.content}`).join("\n");
	const answer = await grok(LOOTS, `Cijfers:\n${pack.brief}\n\nGesprek:\n${thread}`, 700);
	const text = answer.ok ? answer.text : answer.error;
	if (answer.ok) await sql`
        insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'assistant', ${text}, 'loots')`;
	return {
		ok: answer.ok,
		text
	};
});
function brandOf(input) {
	const name = str(input, 24);
	if (name.length < 2) throw new Error("De naam heeft minstens twee tekens nodig.");
	if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(name)) throw new Error("Alleen letters, cijfers, een spatie of een streepje.");
	return name;
}
var saveBrand_createServerFn_handler = createServerRpc({
	id: "75a0fe448f40f4d1748ce4b011acc4761e2f94ea039f9da9829a28b78f933cd3",
	name: "saveBrand",
	filename: "src/lib/ops-agents.ts"
}, (opts) => saveBrand.__executeServer(opts));
var saveBrand = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => brandOf(input?.brand)).handler(saveBrand_createServerFn_handler, async ({ context, data }) => {
	await (await db())`
      insert into desk_settings (user_id, brand) values (${context.userId}, ${data})
      on conflict (user_id) do update set brand = excluded.brand`;
	return { brand: data };
});
var saveVoice_createServerFn_handler = createServerRpc({
	id: "2a207f213f1dad0efe414976ca9d8dcdce9135c45b23daa7806095ffb6b0f14c",
	name: "saveVoice",
	filename: "src/lib/ops-agents.ts"
}, (opts) => saveVoice.__executeServer(opts));
var saveVoice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	const agentName = str(row.agentName, 24);
	if (agentName.length < 2) throw new Error("De stem heeft een naam nodig.");
	if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(agentName)) throw new Error("Alleen letters, cijfers, een spatie of een streepje.");
	const lang = str(row.lang, 12);
	return {
		agentName,
		voiceUri: str(row.voiceUri, 200),
		lang: VOICE_LANGS.includes(lang) ? lang : "nl-BE",
		rate: clamp(Number(row.rate), .7, 1.5, 1),
		pitch: clamp(Number(row.pitch), .7, 1.4, 1),
		volume: clamp(Number(row.volume), .2, 1, 1),
		autoSpeak: Boolean(row.autoSpeak),
		sendOnListen: row.sendOnListen == null ? true : Boolean(row.sendOnListen)
	};
}).handler(saveVoice_createServerFn_handler, async ({ context, data }) => {
	await (await db())`
      insert into desk_settings (
        user_id, brand, agent_name, voice_uri, voice_lang, voice_rate, voice_pitch, voice_volume, auto_speak, send_on_listen
      ) values (
        ${context.userId}, 'KADE', ${data.agentName}, ${data.voiceUri}, ${data.lang}, ${data.rate}, ${data.pitch},
        ${data.volume}, ${data.autoSpeak}, ${data.sendOnListen}
      )
      on conflict (user_id) do update set
        agent_name = excluded.agent_name,
        voice_uri = excluded.voice_uri,
        voice_lang = excluded.voice_lang,
        voice_rate = excluded.voice_rate,
        voice_pitch = excluded.voice_pitch,
        voice_volume = excluded.voice_volume,
        auto_speak = excluded.auto_speak,
        send_on_listen = excluded.send_on_listen`;
	return data;
});
var askHoofd_createServerFn_handler = createServerRpc({
	id: "c3e8112b5981ee4c3e86fc10a2b985448295089cd937052b642f0a7ac6d2baeb",
	name: "askHoofd",
	filename: "src/lib/ops-agents.ts"
}, (opts) => askHoofd.__executeServer(opts));
var askHoofd = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const text = str(input?.text, 4e3);
	if (!text) throw new Error("Zeg iets.");
	return { text };
}).handler(askHoofd_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	const settings = await sql`select agent_name from desk_settings where user_id = ${userId}`;
	const name = str(settings[0]?.agent_name, 24) || "Jarvis";
	await sql`
      insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'user', ${data.text}, 'hoofd')`;
	const history = await sql`
      select role, content from agent_messages where user_id = ${userId} and channel = 'hoofd' order by created_at desc limit 8`;
	const pack = await contextPack(sql, userId);
	const thread = history.reverse().map((m) => `${m.role === "assistant" ? name : "Jij"}: ${m.content}`).join("\n");
	const answer = await grok(`Je bent ${name}, de hoofdstem van deze zaakterminal. Men spreekt je hardop aan.
Toon: droog, precies, licht sarcastisch, nooit onderdanig. Nederlands uit Vlaanderen. Geen emoji. Geen "tot je dienst".
Je ziet de cijfers, het open werk, de storingen en de inventaris die je krijgt. Verzin niets dat daar niet staat.
Antwoord zodat het hardop te volgen is: korte zinnen. Maximaal honderdtwintig woorden, tenzij ze uitdrukkelijk een lijst vragen.
Als de vraag fiscaal is, één zin dat je geen erkende boekhouder bent. Je dient niets in.
Je bestuurt geen huis, geen auto en geen lichten. Je bestuurt deze terminal.`, `Situatie:\n${pack.brief}\n\nGesprek:\n${thread}`, 500);
	const text = answer.ok ? answer.text : answer.error;
	if (answer.ok) await sql`
        insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'assistant', ${text}, 'hoofd')`;
	return {
		ok: answer.ok,
		text
	};
});
var askSchaar_createServerFn_handler = createServerRpc({
	id: "b18a1b037560665c467cfc75a869a55eadfbf73ff8b5476cc804e72f662a6e02",
	name: "askSchaar",
	filename: "src/lib/ops-agents.ts"
}, (opts) => askSchaar.__executeServer(opts));
var askSchaar = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const text = str(input?.text, 4e3);
	if (!text) throw new Error("Zeg wat de druk moet verlagen.");
	return { text };
}).handler(askSchaar_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const userId = context.userId;
	await sql`
      insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'user', ${data.text}, 'schaar')`;
	const history = await sql`
      select role, content from agent_messages where user_id = ${userId} and channel = 'schaar' order by created_at desc limit 8`;
	const pack = await contextPack(sql, userId);
	const thread = history.reverse().map((m) => `${m.role === "assistant" ? "Schaar" : "Jij"}: ${m.content}`).join("\n");
	const answer = await grok(SCHAAR, `Cijfers:\n${pack.brief}\n\nGesprek:\n${thread}`, 700);
	const text = answer.ok ? answer.text : answer.error;
	if (answer.ok) await sql`
        insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'assistant', ${text}, 'schaar')`;
	return {
		ok: answer.ok,
		text
	};
});
var askResearch_createServerFn_handler = createServerRpc({
	id: "80cb00e56503e2218fce119ae82eb6da795062e4b85a48e0184ece63a03539e9",
	name: "askResearch",
	filename: "src/lib/ops-agents.ts"
}, (opts) => askResearch.__executeServer(opts));
var askResearch = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const question = str(input?.question, 4e3);
	if (question.length < 8) throw new Error("Formuleer de vraag iets scherper.");
	return { question };
}).handler(askResearch_createServerFn_handler, async ({ context, data }) => {
	const sql = await db();
	const pack = await contextPack(sql, context.userId);
	const answer = await grok(`${LOOTS}\nDit is een research-opdracht. Structuur: kern in twee zinnen, dan de nuttige punten, dan wat je zou natrekken. Geen bron verzinnen. Als je iets niet weet, zeg dat.`, `Context van de zaak, alleen gebruiken als het relevant is:\n${pack.brief}\n\nVraag:\n${data.question}`, 900);
	if (!answer.ok) return answer;
	const title = data.question.split(/[.?\n]/)[0]?.slice(0, 90) || "Research";
	await sql`
      insert into researches (id, user_id, title, question, answer)
      values (${uid()}, ${context.userId}, ${title}, ${data.question}, ${answer.text})`;
	return answer;
});
function mailItems(data) {
	const obj = data && typeof data === "object" ? data : null;
	const list = Array.isArray(data) ? data : obj ? [
		"messages",
		"emails",
		"items",
		"threads",
		"results",
		"value"
	].map((key) => obj[key]).find((value) => Array.isArray(value)) : null;
	if (!Array.isArray(list)) return [];
	return list.slice(0, 20).map((row) => {
		const item = row ?? {};
		const fromObj = item.from && typeof item.from === "object" ? item.from : null;
		return {
			title: str(item.subject ?? item.title ?? item.snippet ?? "Bericht", 180),
			from: str(item.from ?? fromObj?.email ?? fromObj?.name ?? item.sender ?? item.fromEmail ?? "", 180),
			date: str(item.date ?? item.internalDate ?? item.receivedAt ?? item.receivedDateTime ?? "", 40),
			snippet: str(item.snippet ?? item.preview ?? item.bodyPreview ?? item.summary ?? "", 280)
		};
	});
}
var searchMail_createServerFn_handler = createServerRpc({
	id: "0dcf3c27e858a2fdc35337a2fcf2a7b0e2712991f42e23c7e6e5af9a4487e926",
	name: "searchMail",
	filename: "src/lib/ops-agents.ts"
}, (opts) => searchMail.__executeServer(opts));
var searchMail = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const row = input ?? {};
	return {
		provider: row.provider === "outlook" ? "outlook" : "gmail",
		query: str(row.query, 240) || "newer_than:21d"
	};
}).handler(searchMail_createServerFn_handler, async ({ data }) => {
	const { callTool } = await import("./client.server-DZju7zWn.mjs");
	const { ConnectorType } = await import("./types-SN-XU-b5.mjs").then((n) => n.a);
	const connectorType = data.provider === "gmail" ? ConnectorType.Gmail : ConnectorType.Outlook;
	const names = data.provider === "gmail" ? [
		"gmail_search",
		"google_gmail_search",
		"gmail_search_emails"
	] : [
		"outlook_search",
		"outlook_search_messages",
		"outlook_list_messages"
	];
	let last = null;
	for (const name of names) {
		last = await callTool(name, {
			query: data.query,
			q: data.query,
			maxResults: 12,
			max_results: 12
		}, { connectorType });
		if (last.ok || last.loginRequired || last.pending) break;
		const msg = (last.errorMessage ?? "").toLowerCase();
		if (!(msg.includes("unknown") || msg.includes("not found") || msg.includes("no such") || msg.includes("invalid tool"))) break;
	}
	if (!last) return {
		ok: false,
		errorMessage: "Geen postverbinding.",
		items: []
	};
	return {
		ok: last.ok,
		pending: Boolean(last.pending),
		loginRequired: Boolean(last.loginRequired),
		loginUrl: last.loginUrl,
		errorMessage: last.errorMessage,
		items: mailItems(last.data),
		rawHint: last.ok && mailItems(last.data).length === 0 ? JSON.stringify(last.data)?.slice(0, 500) ?? "" : ""
	};
});
export { askHoofd_createServerFn_handler, askLoots_createServerFn_handler, askResearch_createServerFn_handler, askSchaar_createServerFn_handler, deleteBot_createServerFn_handler, runBot_createServerFn_handler, saveBot_createServerFn_handler, saveBrand_createServerFn_handler, saveVoice_createServerFn_handler, searchMail_createServerFn_handler };
