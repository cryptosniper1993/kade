import { round2 } from "@/lib/money";
import type { Asset, AssetCategory } from "@/lib/types";

export const ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: "wagen", label: "Wagen" },
  { id: "hardware", label: "Hardware" },
  { id: "software", label: "Software" },
  { id: "kantoor", label: "Kantoor" },
  { id: "overig", label: "Overig" },
];

export function assetAccount(category: AssetCategory): string {
  if (category === "wagen") return "2200";
  if (category === "software") return "2210";
  if (category === "kantoor") return "2500";
  return "2400";
}

export function leaseCostAccount(category: AssetCategory): string {
  if (category === "wagen") return "6150";
  if (category === "software") return "6110";
  if (category === "kantoor") return "6160";
  return "6120";
}

export function defaultLife(category: AssetCategory): number {
  if (category === "wagen") return 60;
  if (category === "kantoor") return 120;
  if (category === "software") return 36;
  return 36;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function monthsInUse(acquiredOn: string | null, today: string, life: number): number {
  if (!acquiredOn) return 0;
  const start = parseIso(acquiredOn);
  const now = parseIso(today);
  if (!start || !now) return 0;
  if (today < acquiredOn) return 0;
  const elapsed = (now.y - start.y) * 12 + (now.m - start.m) + 1;
  return Math.max(0, Math.min(life, elapsed));
}

export function depreciation(asset: Asset, today: string): { monthly: number; book: number; elapsed: number } {
  if (asset.kind !== "eigendom") return { monthly: 0, book: 0, elapsed: 0 };
  const life = Math.max(1, asset.lifeMonths);
  const base = Math.max(0, round2(asset.amountEur - asset.residualEur));
  const monthly = life > 0 ? round2(base / life) : 0;
  const elapsed = monthsInUse(asset.acquiredOn, today, life);
  if (!asset.acquiredOn || asset.amountEur <= 0) {
    return { monthly, book: round2(Math.max(asset.amountEur, 0)), elapsed: 0 };
  }
  if (elapsed >= life) return { monthly, book: round2(asset.residualEur), elapsed };
  const worn = round2(Math.min(base, monthly * elapsed));
  return { monthly, book: round2(Math.max(asset.residualEur, asset.amountEur - worn)), elapsed };
}

export function daysUntil(today: string, date: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function fleetSnapshot(assets: Asset[], today: string): {
  owned: number;
  leased: number;
  book: number;
  monthlyLease: number;
  ending: Asset[];
  broken: Asset[];
} {
  let book = 0;
  let monthlyLease = 0;
  let owned = 0;
  let leased = 0;
  const ending: Asset[] = [];
  const broken: Asset[] = [];
  for (const asset of assets) {
    if (asset.status === "einde") continue;
    if (asset.status === "defect") broken.push(asset);
    if (asset.kind === "lease") {
      leased += 1;
      monthlyLease = round2(monthlyLease + asset.amountEur);
      if (asset.endsOn && daysUntil(today, asset.endsOn) <= 90) ending.push(asset);
    } else {
      owned += 1;
      book = round2(book + depreciation(asset, today).book);
    }
  }
  return { owned, leased, book, monthlyLease, ending, broken };
}
