import test from 'node:test';
import assert from 'node:assert/strict';
import { createDishParser } from './dishStream.js';

test('complete dish objects are emitted as the JSON arrives', () => {
  const parser = createDishParser();
  const first = parser.push('{"dishes":[{"name":"Soup","allergens":[],"tags":[');
  assert.equal(first.length, 0);
  const second = parser.push(']},{"name":"Tea","note":"has a } brace","tags":[]}]}');
  assert.deepEqual(second.map((dish) => dish.name), ['Soup', 'Tea']);
  assert.deepEqual(parser.push(''), []);
});

test('a brace inside a string does not end the dish early', () => {
  const parser = createDishParser();
  const dishes = parser.push('[{"name":"Stew {house}","allergens":[]}]');
  assert.equal(dishes.length, 1);
  assert.equal(dishes[0].name, 'Stew {house}');
});
