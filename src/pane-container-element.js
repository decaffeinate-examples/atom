/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let PaneContainerElement;
const {CompositeDisposable} = require('event-kit');
const _ = require('underscore-plus');

module.exports =
(PaneContainerElement = class PaneContainerElement extends HTMLElement {
  createdCallback() {
    this.subscriptions = new CompositeDisposable;
    return this.classList.add('panes');
  }

  initialize(model, {views}) {
    this.model = model;
    this.views = views;
    if (this.views == null) { throw new Error("Must pass a views parameter when initializing PaneContainerElements"); }

    this.subscriptions.add(this.model.observeRoot(this.rootChanged.bind(this)));
    return this;
  }

  rootChanged(root) {
    let focusedElement;
    if (this.hasFocus()) { focusedElement = document.activeElement; }
    if (this.firstChild != null) {
      this.firstChild.remove();
    }
    if (root != null) {
      const view = this.views.getView(root);
      this.appendChild(view);
      return (focusedElement != null ? focusedElement.focus() : undefined);
    }
  }

  hasFocus() {
    return (this === document.activeElement) || this.contains(document.activeElement);
  }
});


module.exports = (PaneContainerElement = document.registerElement('atom-pane-container', {prototype: PaneContainerElement.prototype}));
