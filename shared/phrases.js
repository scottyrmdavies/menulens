const LANGUAGES = ['en', 'es', 'fr', 'it', 'de', 'pt'];

const DIET_LABELS = {
  en: {
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    'gluten-free': 'Gluten-Free',
    'dairy-free': 'Dairy-Free',
    'nut-free': 'Nut-Free',
    'low-carb': 'Low-Carb',
    keto: 'Keto',
    halal: 'Halal',
    kosher: 'Kosher',
  },
  es: {
    vegetarian: 'Vegetariano',
    vegan: 'Vegano',
    'gluten-free': 'Sin gluten',
    'dairy-free': 'Sin lácteos',
    'nut-free': 'Sin frutos secos',
    'low-carb': 'Bajo en carbohidratos',
    keto: 'Keto',
    halal: 'Halal',
    kosher: 'Kosher',
  },
  fr: {
    vegetarian: 'Végétarien',
    vegan: 'Végan',
    'gluten-free': 'Sans gluten',
    'dairy-free': 'Sans lactose',
    'nut-free': 'Sans fruits à coque',
    'low-carb': 'Pauvre en glucides',
    keto: 'Keto',
    halal: 'Halal',
    kosher: 'Casher',
  },
  it: {
    vegetarian: 'Vegetariano',
    vegan: 'Vegano',
    'gluten-free': 'Senza glutine',
    'dairy-free': 'Senza latticini',
    'nut-free': 'Senza frutta a guscio',
    'low-carb': 'Low-carb',
    keto: 'Keto',
    halal: 'Halal',
    kosher: 'Kosher',
  },
  de: {
    vegetarian: 'Vegetarisch',
    vegan: 'Vegan',
    'gluten-free': 'Glutenfrei',
    'dairy-free': 'Laktosefrei',
    'nut-free': 'Nussfrei',
    'low-carb': 'Kohlenhydratarm',
    keto: 'Keto',
    halal: 'Halal',
    kosher: 'Koscher',
  },
  pt: {
    vegetarian: 'Vegetariano',
    vegan: 'Vegano',
    'gluten-free': 'Sem glúten',
    'dairy-free': 'Sem laticínios',
    'nut-free': 'Sem frutos secos',
    'low-carb': 'Baixo em hidratos',
    keto: 'Keto',
    halal: 'Halal',
    kosher: 'Kosher',
  },
};

const ALLERGEN_NAMES = {
  es: {
    Peanuts: 'cacahuetes',
    'Tree Nuts': 'frutos secos',
    Milk: 'leche',
    Eggs: 'huevo',
    Fish: 'pescado',
    Shellfish: 'marisco',
    Wheat: 'trigo',
    Soy: 'soja',
    Sesame: 'sésamo',
  },
  fr: {
    Peanuts: 'arachides',
    'Tree Nuts': 'fruits à coque',
    Milk: 'lait',
    Eggs: 'œufs',
    Fish: 'poisson',
    Shellfish: 'crustacés ou mollusques',
    Wheat: 'blé',
    Soy: 'soja',
    Sesame: 'sésame',
  },
  it: {
    Peanuts: 'arachidi',
    'Tree Nuts': 'frutta a guscio',
    Milk: 'latte',
    Eggs: 'uova',
    Fish: 'pesce',
    Shellfish: 'crostacei o molluschi',
    Wheat: 'frumento',
    Soy: 'soia',
    Sesame: 'sesamo',
  },
  de: {
    Peanuts: 'Erdnüsse',
    'Tree Nuts': 'Schalenfrüchte',
    Milk: 'Milch',
    Eggs: 'Eier',
    Fish: 'Fisch',
    Shellfish: 'Schalentiere',
    Wheat: 'Weizen',
    Soy: 'Soja',
    Sesame: 'Sesam',
  },
  pt: {
    Peanuts: 'amendoins',
    'Tree Nuts': 'frutos de casca rija',
    Milk: 'leite',
    Eggs: 'ovos',
    Fish: 'peixe',
    Shellfish: 'marisco',
    Wheat: 'trigo',
    Soy: 'soja',
    Sesame: 'sésamo',
  },
};

const CONTAINS = {
  en: (name) => `contains ${name}`,
  es: (name) => `contiene ${name}`,
  fr: (name) => `contient ${name}`,
  it: (name) => `contiene ${name}`,
  de: (name) => `enthält ${name}`,
  pt: (name) => `contém ${name}`,
};

const NOT_STATED = {
  en: (label) => `${label} not stated on the menu`,
  es: (label) => `${label} no figura en la carta`,
  fr: (label) => `${label} n'est pas indiqué sur la carte`,
  it: (label) => `${label} non è indicato nel menu`,
  de: (label) => `${label} steht nicht auf der Karte`,
  pt: (label) => `${label} não está indicado no menu`,
};

const ALCOHOL = {
  en: 'contains alcohol',
  es: 'contiene alcohol',
  fr: 'contient de l’alcool',
  it: 'contiene alcol',
  de: 'enthält Alkohol',
  pt: 'contém álcool',
};

const NOTE = {
  en: 'conflicts with what you told us',
  es: 'choca con lo que nos contaste',
  fr: 'entre en conflit avec ce que vous nous avez dit',
  it: 'è in conflitto con quello che ci hai detto',
  de: 'passt nicht zu dem, was du uns gesagt hast',
  pt: 'conflita com o que nos disse',
};

const ESTIMATE = {
  en: 'estimate',
  es: 'estimación',
  fr: 'estimation',
  it: 'stima',
  de: 'Schätzung',
  pt: 'estimativa',
};

function normalizeLanguage(value) {
  const code = typeof value === 'string' ? value.slice(0, 2).toLowerCase() : 'en';
  return LANGUAGES.includes(code) ? code : 'en';
}

function dietLabel(language, id) {
  const lang = normalizeLanguage(language);
  return DIET_LABELS[lang][id] ?? DIET_LABELS.en[id] ?? id;
}

function containsPhrase(language, allergen) {
  const lang = normalizeLanguage(language);
  const name = lang === 'en' ? allergen : (ALLERGEN_NAMES[lang]?.[allergen] ?? allergen);
  return CONTAINS[lang](name);
}

function notStatedPhrase(language, label) {
  const lang = normalizeLanguage(language);
  return NOT_STATED[lang](label);
}

function alcoholPhrase(language) {
  return ALCOHOL[normalizeLanguage(language)];
}

function notePhrase(language) {
  return NOTE[normalizeLanguage(language)];
}

function estimateWord(language) {
  return ESTIMATE[normalizeLanguage(language)];
}

export {
  LANGUAGES,
  alcoholPhrase,
  containsPhrase,
  dietLabel,
  estimateWord,
  normalizeLanguage,
  notStatedPhrase,
  notePhrase,
};
