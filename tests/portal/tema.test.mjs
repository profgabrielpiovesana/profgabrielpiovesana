import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../../scripts/tema.js', import.meta.url), 'utf8');

function page(storage) {
  const root = { dataset: {} };
  const button = { attributes: {}, listeners: {}, setAttribute(k,v) { this.attributes[k] = v; }, addEventListener(k,fn) { this.listeners[k] = fn; } };
  const document = { documentElement: root, querySelector: () => button, addEventListener: (_event, fn) => fn() };
  runInNewContext(source, { document, localStorage: storage });
  return { root, button, toggle: () => button.listeners.click() };
}

test('modo claro é o padrão; escolha escura persiste entre páginas e volta ao claro', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) };
  const first = page(storage);
  assert.equal(first.root.dataset.theme, 'light');
  assert.equal(first.button.attributes['aria-pressed'], 'false');
  first.toggle();
  assert.equal(first.root.dataset.theme, 'dark');
  assert.equal(first.button.attributes['aria-pressed'], 'true');
  const second = page(storage);
  assert.equal(second.root.dataset.theme, 'dark');
  second.toggle();
  assert.equal(second.root.dataset.theme, 'light');
  assert.equal(page(storage).root.dataset.theme, 'light');
});

test('preferência inválida ou armazenamento indisponível não quebra o seletor', () => {
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const first = page(unavailable);
  assert.equal(first.root.dataset.theme, 'light');
  first.toggle();
  assert.equal(first.root.dataset.theme, 'dark');
  assert.equal(page({ getItem: () => 'unexpected', setItem() {} }).root.dataset.theme, 'light');
});
