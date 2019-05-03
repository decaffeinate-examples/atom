/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require('underscore-plus');

const ItemSpecificities = new WeakMap;

var merge = function(menu, item, itemSpecificity) {
  let matchingItem;
  if (itemSpecificity == null) { itemSpecificity = Infinity; }
  item = cloneMenuItem(item);
  if (itemSpecificity) { ItemSpecificities.set(item, itemSpecificity); }
  const matchingItemIndex = findMatchingItemIndex(menu, item);
  if (matchingItemIndex !== - 1) { matchingItem = menu[matchingItemIndex]; }

  if (matchingItem != null) {
    if (item.submenu != null) {
      for (let submenuItem of Array.from(item.submenu)) { merge(matchingItem.submenu, submenuItem, itemSpecificity); }
    } else if (itemSpecificity) {
      if (!(itemSpecificity < ItemSpecificities.get(matchingItem))) {
        menu[matchingItemIndex] = item;
      }
    }
  } else if ((item.type !== 'separator') || (__guard__(_.last(menu), x => x.type) !== 'separator')) {
    menu.push(item);
  }

};

var unmerge = function(menu, item) {
  let matchingItem;
  const matchingItemIndex = findMatchingItemIndex(menu, item);
  if (matchingItemIndex !== - 1) { matchingItem = menu[matchingItemIndex]; }

  if (matchingItem != null) {
    if (item.submenu != null) {
      for (let submenuItem of Array.from(item.submenu)) { unmerge(matchingItem.submenu, submenuItem); }
    }

    if (!((matchingItem.submenu != null ? matchingItem.submenu.length : undefined) > 0)) {
      return menu.splice(matchingItemIndex, 1);
    }
  }
};

var findMatchingItemIndex = function(menu, {type, label, submenu}) {
  if (type === 'separator') { return -1; }
  for (let index = 0; index < menu.length; index++) {
    const item = menu[index];
    if ((normalizeLabel(item.label) === normalizeLabel(label)) && ((item.submenu != null) === (submenu != null))) {
      return index;
    }
  }
  return -1;
};

var normalizeLabel = function(label) {
  if (label == null) { return undefined; }

  if (process.platform === 'darwin') {
    return label;
  } else {
    return label.replace(/\&/g, '');
  }
};

var cloneMenuItem = function(item) {
  item = _.pick(item, 'type', 'label', 'enabled', 'visible', 'command', 'submenu', 'commandDetail', 'role');
  if (item.submenu != null) {
    item.submenu = item.submenu.map(submenuItem => cloneMenuItem(submenuItem));
  }
  return item;
};

module.exports = {merge, unmerge, normalizeLabel, cloneMenuItem};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}