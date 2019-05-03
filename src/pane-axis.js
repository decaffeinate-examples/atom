/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let PaneAxis;
const {Emitter, CompositeDisposable} = require('event-kit');
const {flatten} = require('underscore-plus');
const Model = require('./model');
const PaneAxisElement = require('./pane-axis-element');

module.exports =
(PaneAxis = (function() {
  PaneAxis = class PaneAxis extends Model {
    static initClass() {
      this.prototype.parent = null;
      this.prototype.container = null;
      this.prototype.orientation = null;
    }

    static deserialize(state, {deserializers, views}) {
      state.children = state.children.map(childState => deserializers.deserialize(childState));
      return new (this)(state, views);
    }

    constructor({orientation, children, flexScale}, viewRegistry) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { return this; }).toString();
        let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
        eval(`${thisName} = this;`);
      }
      this.orientation = orientation;
      this.viewRegistry = viewRegistry;
      this.emitter = new Emitter;
      this.subscriptionsByChild = new WeakMap;
      this.subscriptions = new CompositeDisposable;
      this.children = [];
      if (children != null) {
        for (let child of Array.from(children)) { this.addChild(child); }
      }
      this.flexScale = flexScale != null ? flexScale : 1;
    }

    serialize() {
      return {
        deserializer: 'PaneAxis',
        children: this.children.map(child => child.serialize()),
        orientation: this.orientation,
        flexScale: this.flexScale
      };
    }

    getElement() {
      return this.element != null ? this.element : (this.element = new PaneAxisElement().initialize(this, this.viewRegistry));
    }

    getFlexScale() { return this.flexScale; }

    setFlexScale(flexScale) {
      this.flexScale = flexScale;
      this.emitter.emit('did-change-flex-scale', this.flexScale);
      return this.flexScale;
    }

    getParent() { return this.parent; }

    setParent(parent) { this.parent = parent; return this.parent; }

    getContainer() { return this.container; }

    setContainer(container) {
      if (container && (container !== this.container)) {
        this.container = container;
        return Array.from(this.children).map((child) => child.setContainer(container));
      }
    }

    getOrientation() { return this.orientation; }

    getChildren() { return this.children.slice(); }

    getPanes() {
      return flatten(this.children.map(child => child.getPanes()));
    }

    getItems() {
      return flatten(this.children.map(child => child.getItems()));
    }

    onDidAddChild(fn) {
      return this.emitter.on('did-add-child', fn);
    }

    onDidRemoveChild(fn) {
      return this.emitter.on('did-remove-child', fn);
    }

    onDidReplaceChild(fn) {
      return this.emitter.on('did-replace-child', fn);
    }

    onDidDestroy(fn) {
      return this.emitter.once('did-destroy', fn);
    }

    onDidChangeFlexScale(fn) {
      return this.emitter.on('did-change-flex-scale', fn);
    }

    observeFlexScale(fn) {
      fn(this.flexScale);
      return this.onDidChangeFlexScale(fn);
    }

    addChild(child, index) {
      if (index == null) { index = this.children.length; }
      this.children.splice(index, 0, child);
      child.setParent(this);
      child.setContainer(this.container);
      this.subscribeToChild(child);
      return this.emitter.emit('did-add-child', {child, index});
    }

    adjustFlexScale() {
      // get current total flex scale of children
      let child;
      let total = 0;
      for (child of Array.from(this.children)) { total += child.getFlexScale(); }

      const needTotal = this.children.length;
      // set every child's flex scale by the ratio
      return (() => {
        const result = [];
        for (child of Array.from(this.children)) {
          result.push(child.setFlexScale((needTotal * child.getFlexScale()) / total));
        }
        return result;
      })();
    }

    removeChild(child, replacing) {
      if (replacing == null) { replacing = false; }
      const index = this.children.indexOf(child);
      if (index === -1) { throw new Error("Removing non-existent child"); }

      this.unsubscribeFromChild(child);

      this.children.splice(index, 1);
      this.adjustFlexScale();
      this.emitter.emit('did-remove-child', {child, index});
      if (!replacing && (this.children.length < 2)) { return this.reparentLastChild(); }
    }

    replaceChild(oldChild, newChild) {
      this.unsubscribeFromChild(oldChild);
      this.subscribeToChild(newChild);

      newChild.setParent(this);
      newChild.setContainer(this.container);

      const index = this.children.indexOf(oldChild);
      this.children.splice(index, 1, newChild);
      return this.emitter.emit('did-replace-child', {oldChild, newChild, index});
    }

    insertChildBefore(currentChild, newChild) {
      const index = this.children.indexOf(currentChild);
      return this.addChild(newChild, index);
    }

    insertChildAfter(currentChild, newChild) {
      const index = this.children.indexOf(currentChild);
      return this.addChild(newChild, index + 1);
    }

    reparentLastChild() {
      const lastChild = this.children[0];
      lastChild.setFlexScale(this.flexScale);
      this.parent.replaceChild(this, lastChild);
      return this.destroy();
    }

    subscribeToChild(child) {
      const subscription = child.onDidDestroy(() => this.removeChild(child));
      this.subscriptionsByChild.set(child, subscription);
      return this.subscriptions.add(subscription);
    }

    unsubscribeFromChild(child) {
      const subscription = this.subscriptionsByChild.get(child);
      this.subscriptions.remove(subscription);
      return subscription.dispose();
    }

    destroyed() {
      this.subscriptions.dispose();
      this.emitter.emit('did-destroy');
      return this.emitter.dispose();
    }
  };
  PaneAxis.initClass();
  return PaneAxis;
})());
