// Tappable diet chips. Gluten intolerance and coeliac disease are separate
// because the cross-sell must not offer wheat sourdough to coeliac users.
const DIET_CHIPS = Object.freeze([
  Object.freeze({ id: 'vegan', diets: Object.freeze(['vegan']), allergens: Object.freeze([]) }),
  Object.freeze({ id: 'vegetarian', diets: Object.freeze(['vegetarian']), allergens: Object.freeze([]) }),
  Object.freeze({ id: 'nut-allergy', diets: Object.freeze([]), allergens: Object.freeze(['Peanuts', 'Tree Nuts']) }),
  Object.freeze({ id: 'gluten-intolerant', diets: Object.freeze(['gluten-free']), allergens: Object.freeze([]) }),
  Object.freeze({ id: 'coeliac', diets: Object.freeze(['gluten-free']), allergens: Object.freeze([]) }),
  Object.freeze({ id: 'no-alcohol', diets: Object.freeze([]), allergens: Object.freeze([]), avoidAlcohol: true }),
  Object.freeze({ id: 'no-dairy', diets: Object.freeze(['dairy-free']), allergens: Object.freeze(['Milk']) }),
  Object.freeze({ id: 'no-eggs', diets: Object.freeze([]), allergens: Object.freeze(['Eggs']) }),
  Object.freeze({ id: 'shellfish', diets: Object.freeze([]), allergens: Object.freeze(['Shellfish']) }),
  Object.freeze({ id: 'soy', diets: Object.freeze([]), allergens: Object.freeze(['Soy']) }),
  Object.freeze({ id: 'other', diets: Object.freeze([]), allergens: Object.freeze([]) }),
]);

const CHIP_IDS = new Set(DIET_CHIPS.map((chip) => chip.id));

function knownDiets(values) {
  if (!Array.isArray(values)) return [];
  const seen = [];
  for (const value of values) {
    if (typeof value === 'string' && CHIP_IDS.has(value) && !seen.includes(value)) {
      seen.push(value);
    }
  }
  return seen;
}

function preferencesFromProfile(profile = {}, language = 'en') {
  const diets = knownDiets(profile.diets);
  const selected = DIET_CHIPS.filter((chip) => diets.includes(chip.id));
  const dietaryRestrictions = [];
  const allergens = [];
  for (const chip of selected) {
    for (const diet of chip.diets) {
      if (!dietaryRestrictions.includes(diet)) dietaryRestrictions.push(diet);
    }
    for (const allergen of chip.allergens) {
      if (!allergens.includes(allergen)) allergens.push(allergen);
    }
  }
  const notes = diets.includes('other') && typeof profile.other === 'string'
    ? profile.other.trim().slice(0, 500)
    : '';
  return {
    dietaryRestrictions,
    allergens,
    avoidAlcohol: selected.some((chip) => chip.avoidAlcohol),
    notes,
    language,
    diets,
  };
}

export { CHIP_IDS, DIET_CHIPS, knownDiets, preferencesFromProfile };
