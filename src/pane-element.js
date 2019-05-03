/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const {CompositeDisposable} = require('event-kit');

class PaneElement extends HTMLElement {
  static initClass() {
    this.prototype.attached = false;
  }

  createdCallback() {
    this.attached = false;
    this.subscriptions = new CompositeDisposable;
    this.inlineDisplayStyles = new WeakMap;

    this.initializeContent();
    return this.subscribeToDOMEvents();
  }

  attachedCallback() {
    this.attached = true;
    if (this.model.isFocused()) { return this.focus(); }
  }

  detachedCallback() {
    return this.attached = false;
  }

  initializeContent() {
    this.setAttribute('class', 'pane');
    this.setAttribute('tabindex', -1);
    this.appendChild(this.itemViews = document.createElement('div'));
    return this.itemViews.setAttribute('class', 'item-views');
  }

  subscribeToDOMEvents() {
    const handleFocus = event => {
      let view;
      if (!this.isActivating && !this.model.isDestroyed() && !this.contains(event.relatedTarget)) { this.model.focus(); }
      if ((event.target === this) && (view = this.getActiveView())) {
        view.focus();
        return event.stopPropagation();
      }
    };

    const handleBlur = event => {
      if (!this.contains(event.relatedTarget)) { return this.model.blur(); }
    };

    const handleDragOver = function(event) {
      event.preventDefault();
      return event.stopPropagation();
    };

    const handleDrop = event => {
      event.preventDefault();
      event.stopPropagation();
      this.getModel().activate();
      const pathsToOpen = Array.prototype.map.call(event.dataTransfer.files, file => file.path);
      if (pathsToOpen.length > 0) { return this.applicationDelegate.open({pathsToOpen}); }
    };

    this.addEventListener('focus', handleFocus, true);
    this.addEventListener('blur', handleBlur, true);
    this.addEventListener('dragover', handleDragOver);
    return this.addEventListener('drop', handleDrop);
  }

  initialize(model, {views, applicationDelegate}) {
    this.model = model;
    this.views = views;
    this.applicationDelegate = applicationDelegate;
    if (this.views == null) { throw new Error("Must pass a views parameter when initializing PaneElements"); }
    if (this.applicationDelegate == null) { throw new Error("Must pass an applicationDelegate parameter when initializing PaneElements"); }

    this.subscriptions.add(this.model.onDidActivate(this.activated.bind(this)));
    this.subscriptions.add(this.model.observeActive(this.activeStatusChanged.bind(this)));
    this.subscriptions.add(this.model.observeActiveItem(this.activeItemChanged.bind(this)));
    this.subscriptions.add(this.model.onDidRemoveItem(this.itemRemoved.bind(this)));
    this.subscriptions.add(this.model.onDidDestroy(this.paneDestroyed.bind(this)));
    this.subscriptions.add(this.model.observeFlexScale(this.flexScaleChanged.bind(this)));
    return this;
  }

  getModel() { return this.model; }

  activated() {
    this.isActivating = true;
    if (!this.hasFocus()) { this.focus(); } // Don't steal focus from children.
    return this.isActivating = false;
  }

  activeStatusChanged(active) {
    if (active) {
      return this.classList.add('active');
    } else {
      return this.classList.remove('active');
    }
  }

  activeItemChanged(item) {
    let itemPath;
    delete this.dataset.activeItemName;
    delete this.dataset.activeItemPath;

    if (item == null) { return; }

    const hasFocus = this.hasFocus();
    const itemView = this.views.getView(item);

    if (itemPath = typeof item.getPath === 'function' ? item.getPath() : undefined) {
      this.dataset.activeItemName = path.basename(itemPath);
      this.dataset.activeItemPath = itemPath;
    }

    if (!this.itemViews.contains(itemView)) {
      this.itemViews.appendChild(itemView);
    }

    for (let child of Array.from(this.itemViews.children)) {
      if (child === itemView) {
        if (this.attached) { this.showItemView(child); }
      } else {
        this.hideItemView(child);
      }
    }

    if (hasFocus) { return itemView.focus(); }
  }

  showItemView(itemView) {
    const inlineDisplayStyle = this.inlineDisplayStyles.get(itemView);
    if (inlineDisplayStyle != null) {
      return itemView.style.display = inlineDisplayStyle;
    } else {
      return itemView.style.display = '';
    }
  }

  hideItemView(itemView) {
    const inlineDisplayStyle = itemView.style.display;
    if (inlineDisplayStyle !== 'none') {
      if (inlineDisplayStyle != null) { this.inlineDisplayStyles.set(itemView, inlineDisplayStyle); }
      return itemView.style.display = 'none';
    }
  }

  itemRemoved({item, index, destroyed}) {
    let viewToRemove;
    if (viewToRemove = this.views.getView(item)) {
      return viewToRemove.remove();
    }
  }

  paneDestroyed() {
    return this.subscriptions.dispose();
  }

  flexScaleChanged(flexScale) {
    return this.style.flexGrow = flexScale;
  }

  getActiveView() { return this.views.getView(this.model.getActiveItem()); }

  hasFocus() {
    return (this === document.activeElement) || this.contains(document.activeElement);
  }
}
PaneElement.initClass();

module.exports = (PaneElement = document.registerElement('atom-pane', {prototype: PaneElement.prototype}));
