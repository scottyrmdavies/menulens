import test from 'node:test';
import assert from 'node:assert/strict';
import { DIET_CHIPS, preferencesFromProfile } from './profile.js';
import { INSTALL_SNIPPET } from './install.js';
import { t } from './i18n.js';

test('chips map onto the scan preferences', () => {
  assert.equal(DIET_CHIPS.length >= 10, true);
  const preferences = preferencesFromProfile({
    diets: ['vegan', 'nut-allergy', 'no-alcohol', 'coeliac', 'other'],
    other: 'no coriander',
  }, 'fr');
  assert.deepEqual(preferences.dietaryRestrictions, ['vegan', 'gluten-free']);
  assert.deepEqual(preferences.allergens, ['Peanuts', 'Tree Nuts']);
  assert.equal(preferences.avoidAlcohol, true);
  assert.equal(preferences.notes, 'no coriander');
  assert.equal(preferences.language, 'fr');
});

test('the disclaimer and install snippet are plain and reusable', () => {
  assert.equal(t('en', 'disclaimer'), 'This is a guide, not medical advice — always check with staff');
  assert.equal(t('en', 'installSnippet'), INSTALL_SNIPPET);
  assert.match(INSTALL_SNIPPET, /Add to Home Screen/);
  assert.match(INSTALL_SNIPPET, /Share sheet/);
});
