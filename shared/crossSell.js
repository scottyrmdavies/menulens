// Add a mapping here to show another card. `unless` is a hard exclusion:
// coeliac disease must never receive the wheat-sourdough card.
const OFFERS = Object.freeze([
  Object.freeze({
    id: 'sourdough',
    when: Object.freeze(['gluten-intolerant']),
    unless: Object.freeze(['coeliac']),
    href: 'https://prettyperfectpastries.com',
    bodies: Object.freeze({
      en: "Don't get on with supermarket bread? Many people find long-fermented sourdough easier — try our pizza dough. Wheat sourdough is not gluten-free and is not safe for coeliac disease.",
      es: '¿No te sienta bien el pan del supermercado? A mucha gente le resulta más fácil el pan de masa madre de fermentación larga — prueba nuestra masa de pizza. La masa madre de trigo no es sin gluten y no es segura para la celiaquía.',
      fr: 'Le pain de supermarché ne vous réussit pas ? Beaucoup de gens trouvent le pain au levain à longue fermentation plus facile — essayez notre pâte à pizza. Le levain de blé n’est pas sans gluten et n’est pas sûr en cas de maladie cœliaque.',
      it: 'Il pane del supermercato non ti va? Molte persone trovano più facile il lievito madre a lunga fermentazione — prova il nostro impasto per pizza. Il lievito madre di frumento non è senza glutine e non è sicuro per la celiachia.',
      de: 'Verträgst du Supermarkt-Brot nicht? Viele Menschen finden lange geführten Sauerteig verträglicher — probier unseren Pizzateig. Weizensauerteig ist nicht glutenfrei und nicht sicher bei Zöliakie.',
      pt: 'O pão de supermercado não lhe cai bem? Muita gente acha o fermento natural de longa fermentação mais fácil — experimente a nossa massa de pizza. A massa lêveda de trigo não é sem glúten e não é segura para a doença celíaca.',
    }),
  }),
  Object.freeze({
    id: 'plant-based',
    when: Object.freeze(['vegan']),
    unless: Object.freeze([]),
    href: '',
    bodies: Object.freeze({
      en: 'Plant-based dishes are marked vegan only when the menu says so. Ask the kitchen about shared fryers, stock, and hidden dairy before you order.',
      es: 'Los platos de origen vegetal se marcan como veganos solo cuando la carta lo dice. Pregunta en cocina por las freidoras compartidas, los caldos y los lácteos ocultos antes de pedir.',
      fr: 'Les plats végétaux ne sont marqués végans que si la carte le dit. Demandez en cuisine les friteuses partagées, les bouillons et les produits laitiers cachés avant de commander.',
      it: 'I piatti vegetali sono segnati come vegani solo se il menu lo dice. Chiedi in cucina di friggitrici in comune, brodi e latticini nascosti prima di ordinare.',
      de: 'Pflanzliche Gerichte gelten nur dann als vegan, wenn die Karte es sagt. Frag in der Küche nach gemeinsamer Fritteuse, Brühe und versteckten Milchprodukten, bevor du bestellst.',
      pt: 'Os pratos de origem vegetal só são marcados como veganos quando o menu o diz. Pergunte na cozinha sobre fritadeiras partilhadas, caldos e laticínios escondidos antes de pedir.',
    }),
  }),
]);

function offersFor(diets, language = 'en') {
  const selected = new Set(Array.isArray(diets) ? diets : []);
  return OFFERS
    .filter((offer) => offer.when.some((id) => selected.has(id)) && !offer.unless.some((id) => selected.has(id)))
    .map((offer) => ({
      id: offer.id,
      href: offer.href,
      body: offer.bodies[language] ?? offer.bodies.en,
    }));
}

export { OFFERS, offersFor };
