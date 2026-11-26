import test from 'node:test';
import assert from 'node:assert/strict';
import { offersFor } from './crossSell.js';

test('gluten-intolerant guests see the sourdough note and coeliac guests do not', () => {
  const gluten = offersFor(['gluten-intolerant']);
  assert.equal(gluten.length, 1);
  assert.match(gluten[0].body, /long-fermented sourdough/);
  assert.match(gluten[0].body, /not safe for coeliac disease/);
  assert.equal(gluten[0].href, 'https://prettyperfectpastries.com');

  assert.equal(offersFor(['coeliac']).length, 0);
  assert.equal(offersFor(['gluten-intolerant', 'coeliac']).length, 0);
});

test('vegan guests see plant-based guidance and not the pastry link', () => {
  const offers = offersFor(['vegan']);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].id, 'plant-based');
  assert.equal(offers[0].href, '');
  assert.match(offers[0].body, /Plant-based/);
  assert.equal(offers[0].body.includes('prettyperfectpastries'), false);
});
