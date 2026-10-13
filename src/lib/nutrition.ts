import type { Food, FoodEntry, Nutrients, Profile, Targets } from '../types';

export const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 };

export function scale(n: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  return {
    calories: n.calories * k,
    protein: n.protein * k,
    carbs: n.carbs * k,
    fat: n.fat * k,
    sugar: n.sugar * k,
    fiber: n.fiber * k,
  };
}

export function sum(list: Nutrients[]): Nutrients {
  return list.reduce(
    (a, b) => ({
      calories: a.calories + b.calories,
      protein: a.protein + b.protein,
      carbs: a.carbs + b.carbs,
      fat: a.fat + b.fat,
      sugar: a.sugar + b.sugar,
      fiber: a.fiber + b.fiber,
    }),
    ZERO,
  );
}

export const entryNutrients = (e: FoodEntry) => scale(e.food.per100g, e.grams);
export const totals = (entries: FoodEntry[]) => sum(entries.map(entryNutrients));

/** Mifflin-St Jeor BMR. */
export function bmr(p: Profile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export const tdee = (p: Profile) => bmr(p) * p.activity;

/**
 * Evidence-based defaults (similar to what MacroFactor / MyFitnessPal derive):
 * - calories: TDEE −20% to lose, +10% to gain
 * - protein: 2.0 g/kg when cutting (preserves muscle), 1.8 g/kg otherwise
 * - fat: 27% of calories
 * - carbs: the remainder
 * - sugar: ≤10% of calories (WHO guideline for free sugars, applied to total as a simple cap)
 * - fiber: 14 g per 1000 kcal (USDA Dietary Guidelines)
 */
export function computeTargets(p: Profile): Targets {
  const mult = p.goal === 'lose' ? 0.8 : p.goal === 'gain' ? 1.1 : 1;
  const floor = p.sex === 'male' ? 1500 : 1200;
  const calories = Math.max(floor, Math.round((tdee(p) * mult) / 10) * 10);
  const protein = Math.round(p.weightKg * (p.goal === 'lose' ? 2.0 : 1.8));
  const fat = Math.round((calories * 0.27) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    calories,
    protein,
    carbs,
    fat,
    sugar: Math.round((calories * 0.1) / 4),
    fiber: Math.round((calories / 1000) * 14),
  };
}

// ---------- Food search ----------

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

/** Open Food Facts: free, no key, great for packaged/branded foods and barcodes. */
function fromOff(p: any): Food | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184;
  const name = p.product_name || p.generic_name;
  if (!name) return null;
  return {
    id: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    source: 'off',
    barcode: p.code,
    servingGrams: num(p.serving_quantity) || undefined,
    servingLabel: p.serving_size || undefined,
    per100g: {
      calories: kcal,
      protein: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
      sugar: num(n.sugars_100g),
      fiber: num(n.fiber_100g),
    },
  };
}

const OFF_FIELDS = 'code,product_name,generic_name,brands,nutriments,serving_quantity,serving_size';

export async function searchOpenFoodFacts(q: string, signal?: AbortSignal): Promise<Food[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`);
  const data = await res.json();
  return (data.products ?? []).map(fromOff).filter((f: Food | null): f is Food => !!f && f.per100g.calories > 0);
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.status === 1 && data.product ? fromOff(data.product) : null;
}

/** USDA FoodData Central: free (key from api.data.gov), best for whole foods. */
export async function searchUsda(q: string, apiKey: string, signal?: AbortSignal): Promise<Food[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey || 'DEMO_KEY')}&query=${encodeURIComponent(q)}&pageSize=20&dataType=Foundation,SR%20Legacy,Branded`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new Error('USDA rate limit hit — add your free API key in Settings.');
  if (!res.ok) throw new Error(`USDA error ${res.status}`);
  const data = await res.json();
  return (data.foods ?? []).map((f: any): Food => {
    const get = (...ids: number[]) => {
      for (const id of ids) {
        const hit = f.foodNutrients?.find((n: any) => n.nutrientId === id);
        if (hit) return num(hit.value);
      }
      return 0;
    };
    const servingGrams = f.servingSizeUnit?.toLowerCase() === 'g' ? num(f.servingSize) : undefined;
    return {
      id: `usda:${f.fdcId}`,
      name: titleCase(f.description ?? 'Unknown'),
      brand: f.brandOwner || f.brandName || undefined,
      source: 'usda',
      servingGrams: servingGrams || undefined,
      servingLabel: f.householdServingFullText || undefined,
      per100g: {
        calories: get(1008, 2047, 2048),
        protein: get(1003),
        carbs: get(1005),
        fat: get(1004),
        sugar: get(2000, 1063),
        fiber: get(1079),
      },
    };
  });
}

function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}
