/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Gutter = require('../src/gutter');

describe('Gutter', function() {
  const fakeGutterContainer = {
    scheduleComponentUpdate() {}
  };
  const name = 'name';

  describe('::hide', () =>
    it('hides the gutter if it is visible.', function() {
      const options = {
        name,
        visible: true
      };
      const gutter = new Gutter(fakeGutterContainer, options);
      const events = [];
      gutter.onDidChangeVisible(gutter => events.push(gutter.isVisible()));

      expect(gutter.isVisible()).toBe(true);
      gutter.hide();
      expect(gutter.isVisible()).toBe(false);
      expect(events).toEqual([false]);
      gutter.hide();
      expect(gutter.isVisible()).toBe(false);
      // An event should only be emitted when the visibility changes.
      return expect(events.length).toBe(1);
    })
  );

  describe('::show', () =>
    it('shows the gutter if it is hidden.', function() {
      const options = {
        name,
        visible: false
      };
      const gutter = new Gutter(fakeGutterContainer, options);
      const events = [];
      gutter.onDidChangeVisible(gutter => events.push(gutter.isVisible()));

      expect(gutter.isVisible()).toBe(false);
      gutter.show();
      expect(gutter.isVisible()).toBe(true);
      expect(events).toEqual([true]);
      gutter.show();
      expect(gutter.isVisible()).toBe(true);
      // An event should only be emitted when the visibility changes.
      return expect(events.length).toBe(1);
    })
  );

  return describe('::destroy', function() {
    let [mockGutterContainer, mockGutterContainerRemovedGutters] = Array.from([]);

    beforeEach(function() {
      mockGutterContainerRemovedGutters = [];
      return mockGutterContainer = { removeGutter(destroyedGutter) {
        return mockGutterContainerRemovedGutters.push(destroyedGutter);
      }
    };
    });

    it('removes the gutter from its container.', function() {
      const gutter = new Gutter(mockGutterContainer, {name});
      gutter.destroy();
      return expect(mockGutterContainerRemovedGutters).toEqual([gutter]);
    });

    it('calls all callbacks registered on ::onDidDestroy.', function() {
      const gutter = new Gutter(mockGutterContainer, {name});
      let didDestroy = false;
      gutter.onDidDestroy(() => didDestroy = true);
      gutter.destroy();
      return expect(didDestroy).toBe(true);
    });

    return it('does not allow destroying the line-number gutter', function() {
      const gutter = new Gutter(mockGutterContainer, {name: 'line-number'});
      return expect(gutter.destroy).toThrow();
    });
  });
});
