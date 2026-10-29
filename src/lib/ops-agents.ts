import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  DEFAULT_BOTS,
  LOOTS,
  SCHAAR,
  asLines,
  contextPack,
  dateStr,
  db,
  grok,
  hasRef,
  insertJournal,
  mapCompany,
  mapMessage,
  mapParty,
  mapSupplier,
  mapVoice,
  num,
  readJournals,
  str,
  uid,
} from "@/lib/ops-shared";
import { accountName, isKnownAccount } from "@/lib/accounts";
import { invoiceTotals, ogmFromSequence } from "@/lib/finance";
import { round2 } from "@/lib/money";
import { readWork } from "@/lib/work";
import { readFleet } from "@/lib/fleet";
import { brusselsToday } from "@/lib/day";
import { personName, priorityQueue, projectName } from "@/lib/briefing";
import { daysUntil, fleetSnapshot } from "@/lib/assets";
import { clamp, flag, VOICE_LANGS } from "@/lib/ops-shared";
import type { Bot, Company, Invoice, InvoiceLine, LegalForm, VatRegime, VoiceSettings } from "@/lib/types";

export const saveBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Partial<Bot>;
    const name = str(row.name, 80);
    if (!name) throw new Error("De bot heeft een naam nodig.");
    return {
      id: str(row.id, 80),
      name,
      role: str(row.role, 60) || "Algemeen",
      brief: str(row.brief, 600),
      task: str(row.task, 2000),
      followed: Boolean(row.followed),
    };
  })
  .handler(async ({ context, data }) => {
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

export const deleteBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    await sql`delete from bots where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const runBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; task?: string };
    const id = str(row.id, 80);
    const task = str(row.task, 2000);
    if (!id || !task) throw new Error("Kies een bot en geef hem een opdracht.");
    return { id, task };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const rows = await sql<Record<string, unknown>>`
      select name, role, brief from bots where id = ${data.id} and user_id = ${context.userId}`;
    if (!rows[0]) throw new Error("Bot niet gevonden.");
    const pack = await contextPack(sql, context.userId);
    const name = str(rows[0].name, 80);
    const system = name === "Schaar"
      ? SCHAAR
      : `${LOOTS}\nJe voert nu één bot uit.\nNaam: ${name}\nRol: ${str(rows[0].role, 60)}\nOpdrachtkader: ${str(rows[0].brief, 600)}`;
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

export const askLoots = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const text = str((input as { text?: string })?.text, 4000);
    if (!text) throw new Error("Zeg iets tegen Loots.");
    return { text };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    await sql`
      insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'user', ${data.text}, 'loots')`;
    const history = await sql<{ role: string; content: string }>`
      select role, content from agent_messages where user_id = ${userId} and channel = 'loots' order by created_at desc limit 8`;
    const pack = await contextPack(sql, userId);
    const thread = history.reverse().map((m) => `${m.role === "assistant" ? "Loots" : "Jij"}: ${m.content}`).join("\n");
    const answer = await grok(LOOTS, `Cijfers:\n${pack.brief}\n\nGesprek:\n${thread}`, 700);
    const text = answer.ok ? answer.text : answer.error;
    if (answer.ok) {
      await sql`
        insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'assistant', ${text}, 'loots')`;
    }
    return { ok: answer.ok, text };
  });

function brandOf(input: unknown): string {
  const name = str(input, 24);
  if (name.length < 2) throw new Error("De naam heeft minstens twee tekens nodig.");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(name)) throw new Error("Alleen letters, cijfers, een spatie of een streepje.");
  return name;
}

export const saveBrand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => brandOf((input as { brand?: string })?.brand))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`
      insert into desk_settings (user_id, brand) values (${context.userId}, ${data})
      on conflict (user_id) do update set brand = excluded.brand`;
    return { brand: data };
  });

export const saveVoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): VoiceSettings => {
    const row = (input ?? {}) as Partial<VoiceSettings>;
    const agentName = str(row.agentName, 24);
    if (agentName.length < 2) throw new Error("De stem heeft een naam nodig.");
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(agentName)) throw new Error("Alleen letters, cijfers, een spatie of een streepje.");
    const lang = str(row.lang, 12);
    return {
      agentName,
      voiceUri: str(row.voiceUri, 200),
      lang: VOICE_LANGS.includes(lang) ? lang : "nl-BE",
      rate: clamp(Number(row.rate), 0.7, 1.5, 1),
      pitch: clamp(Number(row.pitch), 0.7, 1.4, 1),
      volume: clamp(Number(row.volume), 0.2, 1, 1),
      autoSpeak: Boolean(row.autoSpeak),
      sendOnListen: row.sendOnListen == null ? true : Boolean(row.sendOnListen),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`
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

export const askHoofd = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const text = str((input as { text?: string })?.text, 4000);
    if (!text) throw new Error("Zeg iets.");
    return { text };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const settings = await sql<Record<string, unknown>>`select agent_name from desk_settings where user_id = ${userId}`;
    const name = str(settings[0]?.agent_name, 24) || "Jarvis";
    await sql`
      insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'user', ${data.text}, 'hoofd')`;
    const history = await sql<{ role: string; content: string }>`
      select role, content from agent_messages where user_id = ${userId} and channel = 'hoofd' order by created_at desc limit 8`;
    const pack = await contextPack(sql, userId);
    const thread = history.reverse().map((m) => `${m.role === "assistant" ? name : "Jij"}: ${m.content}`).join("\n");
    const answer = await grok(
      `Je bent ${name}, de hoofdstem van deze zaakterminal. Men spreekt je hardop aan.
Toon: droog, precies, licht sarcastisch, nooit onderdanig. Nederlands uit Vlaanderen. Geen emoji. Geen "tot je dienst".
Je ziet de cijfers, het open werk, de storingen en de inventaris die je krijgt. Verzin niets dat daar niet staat.
Antwoord zodat het hardop te volgen is: korte zinnen. Maximaal honderdtwintig woorden, tenzij ze uitdrukkelijk een lijst vragen.
Als de vraag fiscaal is, één zin dat je geen erkende boekhouder bent. Je dient niets in.
Je bestuurt geen huis, geen auto en geen lichten. Je bestuurt deze terminal.`,
      `Situatie:\n${pack.brief}\n\nGesprek:\n${thread}`,
      500,
    );
    const text = answer.ok ? answer.text : answer.error;
    if (answer.ok) {
      await sql`
        insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'assistant', ${text}, 'hoofd')`;
    }
    return { ok: answer.ok, text };
  });

export const askSchaar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const text = str((input as { text?: string })?.text, 4000);
    if (!text) throw new Error("Zeg wat de druk moet verlagen.");
    return { text };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    await sql`
      insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'user', ${data.text}, 'schaar')`;
    const history = await sql<{ role: string; content: string }>`
      select role, content from agent_messages where user_id = ${userId} and channel = 'schaar' order by created_at desc limit 8`;
    const pack = await contextPack(sql, userId);
    const thread = history.reverse().map((m) => `${m.role === "assistant" ? "Schaar" : "Jij"}: ${m.content}`).join("\n");
    const answer = await grok(SCHAAR, `Cijfers:\n${pack.brief}\n\nGesprek:\n${thread}`, 700);
    const text = answer.ok ? answer.text : answer.error;
    if (answer.ok) {
      await sql`
        insert into agent_messages (id, user_id, role, content, channel) values (${uid()}, ${userId}, 'assistant', ${text}, 'schaar')`;
    }
    return { ok: answer.ok, text };
  });

export const askResearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const question = str((input as { question?: string })?.question, 4000);
    if (question.length < 8) throw new Error("Formuleer de vraag iets scherper.");
    return { question };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const pack = await contextPack(sql, context.userId);
    const answer = await grok(
      `${LOOTS}\nDit is een research-opdracht. Structuur: kern in twee zinnen, dan de nuttige punten, dan wat je zou natrekken. Geen bron verzinnen. Als je iets niet weet, zeg dat.`,
      `Context van de zaak, alleen gebruiken als het relevant is:\n${pack.brief}\n\nVraag:\n${data.question}`,
      900,
    );
    if (!answer.ok) return answer;
    const title = data.question.split(/[.?\n]/)[0]?.slice(0, 90) || "Research";
    await sql`
      insert into researches (id, user_id, title, question, answer)
      values (${uid()}, ${context.userId}, ${title}, ${data.question}, ${answer.text})`;
    return answer;
  });

type MailHit = { title: string; from: string; date: string; snippet: string };

function mailItems(data: unknown): MailHit[] {
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const list = Array.isArray(data)
    ? data
    : obj
      ? (["messages", "emails", "items", "threads", "results", "value"] as const)
          .map((key) => obj[key])
          .find((value) => Array.isArray(value))
      : null;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    const fromObj = item.from && typeof item.from === "object" ? (item.from as Record<string, unknown>) : null;
    return {
      title: str(item.subject ?? item.title ?? item.snippet ?? "Bericht", 180),
      from: str(item.from ?? fromObj?.email ?? fromObj?.name ?? item.sender ?? item.fromEmail ?? "", 180),
      date: str(item.date ?? item.internalDate ?? item.receivedAt ?? item.receivedDateTime ?? "", 40),
      snippet: str(item.snippet ?? item.preview ?? item.bodyPreview ?? item.summary ?? "", 280),
    };
  });
}

export const searchMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { provider?: string; query?: string };
    const provider = row.provider === "outlook" ? "outlook" : "gmail";
    const query = str(row.query, 240) || "newer_than:21d";
    return { provider, query };
  })
  .handler(async ({ data }) => {
    const { callTool } = await import("@/lib/app-data/client.server");
    const { ConnectorType } = await import("@/lib/app-data/types");
    const connectorType = data.provider === "gmail" ? ConnectorType.Gmail : ConnectorType.Outlook;
    const names = data.provider === "gmail"
      ? ["gmail_search", "google_gmail_search", "gmail_search_emails"]
      : ["outlook_search", "outlook_search_messages", "outlook_list_messages"];
    let last: Awaited<ReturnType<typeof callTool>> | null = null;
    for (const name of names) {
      last = await callTool(
        name,
        { query: data.query, q: data.query, maxResults: 12, max_results: 12 },
        { connectorType },
      );
      if (last.ok || last.loginRequired || last.pending) break;
      const msg = (last.errorMessage ?? "").toLowerCase();
      const missing = msg.includes("unknown") || msg.includes("not found") || msg.includes("no such") || msg.includes("invalid tool");
      if (!missing) break;
    }
    if (!last) return { ok: false as const, errorMessage: "Geen postverbinding.", items: [] as MailHit[] };
    return {
      ok: last.ok,
      pending: Boolean(last.pending),
      loginRequired: Boolean(last.loginRequired),
      loginUrl: last.loginUrl,
      errorMessage: last.errorMessage,
      items: mailItems(last.data),
      rawHint: last.ok && mailItems(last.data).length === 0 ? JSON.stringify(last.data)?.slice(0, 500) ?? "" : "",
    };
  });

