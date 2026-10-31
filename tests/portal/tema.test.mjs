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

test('widget de depoimentos alterna entre URL clara e escura junto com o tema', () => {
  const lightUrl = 'https://embed-v2.testimonial.to/c/gabriel-piovesana?id=f6cc8575-c5c7-4d48-aa45-3680b25b8d2d';
  const darkUrl = 'https://embed-v2.testimonial.to/c/gabriel-piovesana?id=06cff27a-323a-41d4-aa94-fb92486749b7';
  const iframe = { src: lightUrl };
  const embedAttrs = new Map([
    ['data-url', lightUrl],
    ['data-url-light', lightUrl],
    ['data-url-dark', darkUrl],
  ]);
  const embed = {
    getAttribute: (k) => embedAttrs.get(k),
    setAttribute: (k, v) => embedAttrs.set(k, v),
    querySelector: (sel) => (sel === 'iframe' ? iframe : null),
  };
  const root = { dataset: {} };
  const button = { attributes: {}, listeners: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, fn) { this.listeners[k] = fn; } };
  const document = {
    documentElement: root,
    querySelector: (sel) => (sel === '#theme-toggle' ? button : sel === '.testimonial-to-embed' ? embed : null),
    addEventListener: (_event, fn) => fn(),
  };
  const values = new Map();
  const storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };

  runInNewContext(source, { document, localStorage: storage });
  assert.equal(embedAttrs.get('data-url'), lightUrl);
  assert.equal(iframe.src, lightUrl);

  button.listeners.click();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(embedAttrs.get('data-url'), darkUrl);
  assert.equal(iframe.src, darkUrl);

  button.listeners.click();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(embedAttrs.get('data-url'), lightUrl);
  assert.equal(iframe.src, lightUrl);
});
