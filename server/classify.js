import {
  alcoholPhrase,
  containsPhrase,
  dietLabel as translatedDietLabel,
  estimateWord,
  normalizeLanguage,
  notStatedPhrase,
  notePhrase,
} from '../shared/phrases.js';

const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten-Free' },
  { id: 'dairy-free', label: 'Dairy-Free' },
  { id: 'nut-free', label: 'Nut-Free' },
  { id: 'low-carb', label: 'Low-Carb' },
  { id: 'keto', label: 'Keto' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
];

const DIET_BY_ID = new Map(DIETS.map((diet) => [diet.id, diet]));

const ALLERGENS = [
  'Peanuts',
  'Tree Nuts',
  'Milk',
  'Eggs',
  'Fish',
  'Shellfish',
  'Wheat',
  'Soy',
  'Sesame',
];

const ALLERGEN_BY_KEY = new Map(ALLERGENS.map((name) => [name.toLowerCase(), name]));

const ALLERGEN_ALIASES = new Map([
  ['peanut', 'Peanuts'],
  ['peanuts', 'Peanuts'],
  ['tree nut', 'Tree Nuts'],
  ['tree nuts', 'Tree Nuts'],
  ['nuts', 'Tree Nuts'],
  ['nut', 'Tree Nuts'],
  ['milk', 'Milk'],
  ['dairy', 'Milk'],
  ['egg', 'Eggs'],
  ['eggs', 'Eggs'],
  ['fish', 'Fish'],
  ['shellfish', 'Shellfish'],
  ['wheat', 'Wheat'],
  ['gluten', 'Wheat'],
  ['soy', 'Soy'],
  ['soya', 'Soy'],
  ['sesame', 'Sesame'],
]);

function dietLabel(id, language = 'en') {
  return translatedDietLabel(language, id) ?? DIET_BY_ID.get(id)?.label ?? id;
}

function canonicalAllergen(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return ALLERGEN_BY_KEY.get(key) ?? ALLERGEN_ALIASES.get(key) ?? null;
}

function normalizeTag(tag) {
  if (!tag || typeof tag.id !== 'string') return null;
  const id = tag.id.trim().toLowerCase();
  if (!DIET_BY_ID.has(id)) return null;
  return {
    id,
    basis: tag.basis === 'stated' ? 'stated' : 'estimate',
  };
}

function tagText(tag, language) {
  const label = dietLabel(tag.id, language);
  if (normalizeLanguage(language) === 'en') {
    return tag.basis === 'stated' ? label : `${label} (estimate)`;
  }
  return tag.basis === 'stated' ? label : `${label} (${estimateWord(language)})`;
}

function formatDish(dish, language = 'en') {
  const tags = (dish.tags ?? []).map((tag) => tagText(tag, language));
  if (tags.length === 0) return dish.name;
  return `${dish.name} — ${tags.join(', ')}`;
}

function dietIsStated(dish, id) {
  return (dish.tags ?? []).some((tag) => tag.id === id && tag.basis === 'stated');
}

function satisfiesDiet(dish, dietId) {
  if (dietId === 'vegetarian') {
    return dietIsStated(dish, 'vegetarian') || dietIsStated(dish, 'vegan');
  }
  if (dietId === 'low-carb') {
    return dietIsStated(dish, 'low-carb') || dietIsStated(dish, 'keto');
  }
  return dietIsStated(dish, dietId);
}

function normalizeDish(raw) {
  if (!raw || typeof raw.name !== 'string' || raw.name.trim() === '') return null;
  const allergens = [];
  for (const value of Array.isArray(raw.allergens) ? raw.allergens : []) {
    const name = canonicalAllergen(value);
    if (name && !allergens.includes(name)) allergens.push(name);
  }
  const tags = [];
  for (const tag of Array.isArray(raw.tags) ? raw.tags : []) {
    const normalized = normalizeTag(tag);
    if (normalized && !tags.some((existing) => existing.id === normalized.id)) {
      tags.push(normalized);
    }
  }
  return {
    name: raw.name.trim(),
    allergens,
    tags,
    alcohol: raw.alcohol === true,
    noteConflict: raw.noteConflict === true,
  };
}

function classifyDishes(rawDishes, preferences = {}) {
  const dishes = (Array.isArray(rawDishes) ? rawDishes : [])
    .map(normalizeDish)
    .filter(Boolean);

  const language = normalizeLanguage(preferences.language);
  const wantedDiets = (preferences.dietaryRestrictions ?? []).filter((id) => DIET_BY_ID.has(id));
  const watchedAllergens = (preferences.allergens ?? [])
    .map(canonicalAllergen)
    .filter(Boolean);
  const avoidAlcohol = preferences.avoidAlcohol === true;

  const safeItems = [];
  const riskyItems = [];
  const allergens = [];

  for (const dish of dishes) {
    for (const allergen of dish.allergens) {
      if (!allergens.includes(allergen)) allergens.push(allergen);
    }

    const reasons = [];
    for (const allergen of dish.allergens) {
      if (watchedAllergens.includes(allergen)) reasons.push(containsPhrase(language, allergen));
    }
    if (avoidAlcohol && dish.alcohol) reasons.push(alcoholPhrase(language));
    if (dish.noteConflict) reasons.push(notePhrase(language));
    for (const dietId of wantedDiets) {
      if (!satisfiesDiet(dish, dietId)) {
        reasons.push(notStatedPhrase(language, dietLabel(dietId, language)));
      }
    }

    const line = formatDish(dish, language);
    if (reasons.length > 0) {
      riskyItems.push(`${line} (${reasons.join('; ')})`);
    } else {
      safeItems.push(line);
    }
  }

  return { safeItems, riskyItems, allergens, dishes };
}

function parseModelJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('The dish model returned an empty response.');
  }
  const fenced = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text.trim();
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('The dish model did not return readable JSON.');
  }
  const dishes = Array.isArray(parsed) ? parsed : parsed?.dishes;
  if (!Array.isArray(dishes)) {
    throw new Error('The dish model did not return a dish list.');
  }
  return dishes;
}

export {
  ALLERGENS,
  DIETS,
  classifyDishes,
  formatDish,
  parseModelJson,
};
