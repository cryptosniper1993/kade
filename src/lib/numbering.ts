import { maxInSeries } from "./invoicing.ts";

type SqlLike = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

/**
 * Volgend nummer in een reeks, atomair in één statement (geen race tussen twee tabbladen).
 * De eerste keer wordt de reeks gezaaid met het hoogste bestaande nummer.
 */
export async function nextInSeries(sql: SqlLike, userId: string, series: string, existing: string[] = []): Promise<number> {
  const seed = maxInSeries(existing, series);
  const rows = await sql<{ last: number }>`
    insert into number_series (user_id, series, last) values (${userId}, ${series}, ${seed + 1})
    on conflict (user_id, series) do update set last = greatest(number_series.last, ${seed}) + 1
    returning last`;
  return Number(rows[0]?.last ?? seed + 1);
}

