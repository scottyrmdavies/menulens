import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDishes, parseModelJson } from './classify.js';

test('labels inferred diets as estimates and keeps stated diets unmarked', () => {
  const result = classifyDishes([
    {
      name: 'Garden Plate',
      allergens: [],
      tags: [
        { id: 'vegan', basis: 'estimate' },
        { id: 'gluten-free', basis: 'stated' },
      ],
    },
  ], {});

  assert.deepEqual(result.safeItems, ['Garden Plate — Vegan (estimate), Gluten-Free']);
  assert.deepEqual(result.riskyItems, []);
});

test('an estimate does not count as a confirmed diet', () => {
  const result = classifyDishes([
    { name: 'Mushroom Risotto', allergens: ['Milk'], tags: [{ id: 'vegan', basis: 'estimate' }] },
  ], { dietaryRestrictions: ['vegan'], allergens: [] });

  assert.equal(result.safeItems.length, 0);
  assert.match(result.riskyItems[0], /Vegan \(estimate\)/);
  assert.match(result.riskyItems[0], /Vegan not stated on the menu/);
});

test('a stated diet and a watched allergen sort the dish', () => {
  const safe = classifyDishes([
    { name: 'Lentil Soup', allergens: [], tags: [{ id: 'vegan', basis: 'stated' }] },
  ], { dietaryRestrictions: ['vegan'] });
  assert.deepEqual(safe.safeItems, ['Lentil Soup — Vegan']);

  const risky = classifyDishes([
    { name: 'Pad Thai', allergens: ['peanuts'], tags: [] },
  ], { allergens: ['Peanuts'] });
  assert.match(risky.riskyItems[0], /contains Peanuts/);
  assert.deepEqual(risky.allergens, ['Peanuts']);
});

test('anything other than stated is labeled an estimate', () => {
  const result = classifyDishes([
    { name: 'Green Salad', tags: [{ id: 'keto', basis: 'inferred' }] },
  ], {});
  assert.equal(result.safeItems[0], 'Green Salad — Keto (estimate)');
});

test('parseModelJson accepts fenced JSON and a bare dish array', () => {
  const fenced = parseModelJson('```json\n{"dishes":[{"name":"Tea"}]}\n```');
  assert.equal(fenced[0].name, 'Tea');
  const bare = parseModelJson('[{"name":"Tea"}]');
  assert.equal(bare[0].name, 'Tea');
  assert.throws(() => parseModelJson('hello'), /readable JSON/);
});
