/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const ContextMenuManager = require('../src/context-menu-manager');

describe("ContextMenuManager", function() {
  let [contextMenu, parent, child, grandchild] = Array.from([]);

  beforeEach(function() {
    const {resourcePath} = atom.getLoadSettings();
    contextMenu = new ContextMenuManager({keymapManager: atom.keymaps});
    contextMenu.initialize({resourcePath});

    parent = document.createElement("div");
    child = document.createElement("div");
    grandchild = document.createElement("div");
    parent.classList.add('parent');
    child.classList.add('child');
    grandchild.classList.add('grandchild');
    child.appendChild(grandchild);
    return parent.appendChild(child);
  });

  return describe("::add(itemsBySelector)", function() {
    it("can add top-level menu items that can be removed with the returned disposable", function() {
      const disposable = contextMenu.add({
        '.parent': [{label: 'A', command: 'a'}],
        '.child': [{label: 'B', command: 'b'}],
        '.grandchild': [{label: 'C', command: 'c'}]});

      expect(contextMenu.templateForElement(grandchild)).toEqual([
        {label: 'C', command: 'c'},
        {label: 'B', command: 'b'},
        {label: 'A', command: 'a'}
      ]);

      disposable.dispose();
      return expect(contextMenu.templateForElement(grandchild)).toEqual([]);
  });

    it("can add submenu items to existing menus that can be removed with the returned disposable", function() {
      const disposable1 = contextMenu.add({
        '.grandchild': [{label: 'A', submenu: [{label: 'B', command: 'b'}]}]});
      const disposable2 = contextMenu.add({
        '.grandchild': [{label: 'A', submenu: [{label: 'C', command: 'c'}]}]});

      expect(contextMenu.templateForElement(grandchild)).toEqual([{
        label: 'A',
        submenu: [
          {label: 'B', command: 'b'},
          {label: 'C', command: 'c'}
        ]
      }]);

      disposable2.dispose();
      expect(contextMenu.templateForElement(grandchild)).toEqual([{
        label: 'A',
        submenu: [
          {label: 'B', command: 'b'}
        ]
      }]);

      disposable1.dispose();
      return expect(contextMenu.templateForElement(grandchild)).toEqual([]);
  });

    it("favors the most specific / recently added item in the case of a duplicate label", function() {
      grandchild.classList.add('foo');

      const disposable1 = contextMenu.add({
        '.grandchild': [{label: 'A', command: 'a'}]});
      const disposable2 = contextMenu.add({
        '.grandchild.foo': [{label: 'A', command: 'b'}]});
      const disposable3 = contextMenu.add({
        '.grandchild': [{label: 'A', command: 'c'}]});
      const disposable4 = contextMenu.add({
        '.child': [{label: 'A', command: 'd'}]});

      expect(contextMenu.templateForElement(grandchild)).toEqual([{label: 'A', command: 'b'}]);

      disposable2.dispose();
      expect(contextMenu.templateForElement(grandchild)).toEqual([{label: 'A', command: 'c'}]);

      disposable3.dispose();
      expect(contextMenu.templateForElement(grandchild)).toEqual([{label: 'A', command: 'a'}]);

      disposable1.dispose();
      return expect(contextMenu.templateForElement(grandchild)).toEqual([{label: 'A', command: 'd'}]);
  });

    it("allows multiple separators, but not adjacent to each other", function() {
      contextMenu.add({
        '.grandchild': [
          {label: 'A', command: 'a'},
          {type: 'separator'},
          {type: 'separator'},
          {label: 'B', command: 'b'},
          {type: 'separator'},
          {type: 'separator'},
          {label: 'C', command: 'c'}
        ]});

      return expect(contextMenu.templateForElement(grandchild)).toEqual([
        {label: 'A', command: 'a'},
        {type: 'separator'},
        {label: 'B', command: 'b'},
        {type: 'separator'},
        {label: 'C', command: 'c'}
      ]);
  });

    it("excludes items marked for display in devMode unless in dev mode", function() {
      const disposable1 = contextMenu.add({
        '.grandchild': [{label: 'A', command: 'a', devMode: true}, {label: 'B', command: 'b', devMode: false}]});

      expect(contextMenu.templateForElement(grandchild)).toEqual([{label: 'B', command: 'b'}]);

      contextMenu.devMode = true;
      return expect(contextMenu.templateForElement(grandchild)).toEqual([{label: 'A', command: 'a'}, {label: 'B', command: 'b'}]);
  });

    it("allows items to be associated with `created` hooks which are invoked on template construction with the item and event", function() {
      let createdEvent = null;

      const item = {
        label: 'A',
        command: 'a',
        created(event) {
          this.command = 'b';
          return createdEvent = event;
        }
      };

      contextMenu.add({'.grandchild': [item]});

      const dispatchedEvent = {target: grandchild};
      expect(contextMenu.templateForEvent(dispatchedEvent)).toEqual([{label: 'A', command: 'b'}]);
      expect(item.command).toBe('a'); // doesn't modify original item template
      return expect(createdEvent).toBe(dispatchedEvent);
    });

    it("allows items to be associated with `shouldDisplay` hooks which are invoked on construction to determine whether the item should be included", function() {
      let shouldDisplayEvent = null;
      let shouldDisplay = true;

      const item = {
        label: 'A',
        command: 'a',
        shouldDisplay(event) {
          this.foo = 'bar';
          shouldDisplayEvent = event;
          return shouldDisplay;
        }
      };
      contextMenu.add({'.grandchild': [item]});

      const dispatchedEvent = {target: grandchild};
      expect(contextMenu.templateForEvent(dispatchedEvent)).toEqual([{label: 'A', command: 'a'}]);
      expect(item.foo).toBeUndefined(); // doesn't modify original item template
      expect(shouldDisplayEvent).toBe(dispatchedEvent);

      shouldDisplay = false;
      return expect(contextMenu.templateForEvent(dispatchedEvent)).toEqual([]);
  });

    it("prunes a trailing separator", function() {
      contextMenu.add({
        '.grandchild': [
          {label: 'A', command: 'a'},
          {type: 'separator'},
          {label: 'B', command: 'b'},
          {type: 'separator'}
        ]});

      return expect(contextMenu.templateForEvent({target: grandchild}).length).toBe(3);
    });

    it("prunes a leading separator", function() {
      contextMenu.add({
        '.grandchild': [
          {type: 'separator'},
          {label: 'A', command: 'a'},
          {type: 'separator'},
          {label: 'B', command: 'b'}
        ]});

      return expect(contextMenu.templateForEvent({target: grandchild}).length).toBe(3);
    });

    it("prunes duplicate separators", function() {
      contextMenu.add({
        '.grandchild': [
          {label: 'A', command: 'a'},
          {type: 'separator'},
          {type: 'separator'},
          {label: 'B', command: 'b'}
        ]});

      return expect(contextMenu.templateForEvent({target: grandchild}).length).toBe(3);
    });

    it("prunes all redundant separators", function() {
      contextMenu.add({
        '.grandchild': [
          {type: 'separator'},
          {type: 'separator'},
          {label: 'A', command: 'a'},
          {type: 'separator'},
          {type: 'separator'},
          {label: 'B', command: 'b'},
          {label: 'C', command: 'c'},
          {type: 'separator'},
          {type: 'separator'},
        ]});

      return expect(contextMenu.templateForEvent({target: grandchild}).length).toBe(4);
    });

    it("throws an error when the selector is invalid", function() {
      let addError = null;
      try {
        contextMenu.add({'<>': [{label: 'A', command: 'a'}]});
      } catch (error) {
        addError = error;
      }
      return expect(addError.message).toContain('<>');
    });

    return it("calls `created` hooks for submenu items", function() {
      const item = {
        label: 'A',
        command: 'B',
        submenu: [
          {
            label: 'C',
            created(event) { return this.label = 'D'; },
          }
        ]
      };
      contextMenu.add({'.grandchild': [item]});

      const dispatchedEvent = {target: grandchild};
      return expect(contextMenu.templateForEvent(dispatchedEvent)).toEqual(
        [{
          label: 'A',
          command: 'B',
          submenu: [
            {
              label: 'D',
            }
          ]
        }
        ]);
    });
  });
});
