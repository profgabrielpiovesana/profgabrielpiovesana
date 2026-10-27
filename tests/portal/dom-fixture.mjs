// Minimal DOM surface used by the portal modules; no browser/network involved.
export class Element {
  constructor() { this.children = []; this.listeners = {}; this.value = ''; this.files = []; this.hidden = false; this.disabled = false; this.checked = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  async fire(type) { return this.listeners[type]?.({ preventDefault() {} }); }
  focus() { this.focused = true; }
  setAttribute() {}
  removeAttribute() {}
  reset() { for (const node of this.fields || []) { node.value = ''; node.files = []; } }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  querySelectorAll(selector) {
    const all = this.children.flatMap(node => node instanceof Element ? [node, ...node.querySelectorAll('*')] : []);
    if (selector === '*') return all;
    if (selector.includes('recipient')) return all.filter(n => n.name === 'recipient' && (!selector.includes(':checked') || n.checked));
    if (selector.includes('submit')) return all.filter(n => n.type === 'submit');
    if (selector.startsWith('button')) return all.filter(n => n.tag === 'button');
    return [];
  }
}
export const documentFixture = { createElement(tag) { const node = new Element(); node.tag = tag; return node; }, createTextNode: text => text };
