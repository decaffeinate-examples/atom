/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const ViewRegistry = require('../src/view-registry');

describe("ViewRegistry", function() {
  let registry = null;

  beforeEach(() => registry = new ViewRegistry);

  afterEach(() => registry.clearDocumentRequests());

  describe("::getView(object)", function() {
    describe("when passed a DOM node", () =>
      it("returns the given DOM node", function() {
        const node = document.createElement('div');
        return expect(registry.getView(node)).toBe(node);
      })
    );

    describe("when passed an object with an element property", () =>
      it("returns the element property if it's an instance of HTMLElement", function() {
        class TestComponent {
          constructor() { this.element = document.createElement('div'); }
        }

        const component = new TestComponent;
        return expect(registry.getView(component)).toBe(component.element);
      })
    );

    describe("when passed an object with a getElement function", () =>
      it("returns the return value of getElement if it's an instance of HTMLElement", function() {
        class TestComponent {
          getElement() {
            return this.myElement != null ? this.myElement : (this.myElement = document.createElement('div'));
          }
        }

        const component = new TestComponent;
        return expect(registry.getView(component)).toBe(component.myElement);
      })
    );

    return describe("when passed a model object", function() {
      describe("when a view provider is registered matching the object's constructor", () =>
        it("constructs a view element and assigns the model on it", function() {
          class TestModel {}

          class TestModelSubclass extends TestModel {}

          class TestView {
            initialize(model1) { this.model = model1; return this; }
          }

          const model = new TestModel;

          registry.addViewProvider(TestModel, model => new TestView().initialize(model));

          const view = registry.getView(model);
          expect(view instanceof TestView).toBe(true);
          expect(view.model).toBe(model);

          const subclassModel = new TestModelSubclass;
          const view2 = registry.getView(subclassModel);
          expect(view2 instanceof TestView).toBe(true);
          return expect(view2.model).toBe(subclassModel);
        })
      );

      describe("when a view provider is registered generically, and works with the object", () =>
        it("constructs a view element and assigns the model on it", function() {
          const model = {a: 'b'};

          registry.addViewProvider(function(model) {
            if (model.a === 'b') {
              const element = document.createElement('div');
              element.className = 'test-element';
              return element;
            }
          });

          const view = registry.getView({a: 'b'});
          expect(view.className).toBe('test-element');

          return expect(() => registry.getView({a: 'c'})).toThrow();
        })
      );

      return describe("when no view provider is registered for the object's constructor", () =>
        it("throws an exception", () => expect(() => registry.getView(new Object)).toThrow())
      );
    });
  });

  describe("::addViewProvider(providerSpec)", () =>
    it("returns a disposable that can be used to remove the provider", function() {
      class TestModel {}
      class TestView {
        initialize(model) { this.model = model; return this; }
      }

      const disposable = registry.addViewProvider(TestModel, model => new TestView().initialize(model));

      expect(registry.getView(new TestModel) instanceof TestView).toBe(true);
      disposable.dispose();
      return expect(() => registry.getView(new TestModel)).toThrow();
    })
  );

  describe("::updateDocument(fn) and ::readDocument(fn)", function() {
    let frameRequests = null;

    beforeEach(function() {
      frameRequests = [];
      return spyOn(window, 'requestAnimationFrame').andCallFake(fn => frameRequests.push(fn));
    });

    it("performs all pending writes before all pending reads on the next animation frame", function() {
      let events = [];

      registry.updateDocument(() => events.push('write 1'));
      registry.readDocument(() => events.push('read 1'));
      registry.readDocument(() => events.push('read 2'));
      registry.updateDocument(() => events.push('write 2'));

      expect(events).toEqual([]);

      expect(frameRequests.length).toBe(1);
      frameRequests[0]();
      expect(events).toEqual(['write 1', 'write 2', 'read 1', 'read 2']);

      frameRequests = [];
      events = [];
      const disposable = registry.updateDocument(() => events.push('write 3'));
      registry.updateDocument(() => events.push('write 4'));
      registry.readDocument(() => events.push('read 3'));

      disposable.dispose();

      expect(frameRequests.length).toBe(1);
      frameRequests[0]();
      return expect(events).toEqual(['write 4', 'read 3']);
  });

    return it("performs writes requested from read callbacks in the same animation frame", function() {
      spyOn(window, 'setInterval').andCallFake(fakeSetInterval);
      spyOn(window, 'clearInterval').andCallFake(fakeClearInterval);
      const events = [];

      registry.updateDocument(() => events.push('write 1'));
      registry.readDocument(function() {
        registry.updateDocument(() => events.push('write from read 1'));
        return events.push('read 1');
      });
      registry.readDocument(function() {
        registry.updateDocument(() => events.push('write from read 2'));
        return events.push('read 2');
      });
      registry.updateDocument(() => events.push('write 2'));

      expect(frameRequests.length).toBe(1);
      frameRequests[0]();
      expect(frameRequests.length).toBe(1);

      return expect(events).toEqual([
        'write 1',
        'write 2',
        'read 1',
        'read 2',
        'write from read 1',
        'write from read 2'
      ]);
  });
});

  return describe("::getNextUpdatePromise()", () =>
    it("returns a promise that resolves at the end of the next update cycle", function() {
      let updateCalled = false;
      let readCalled = false;

      return waitsFor('getNextUpdatePromise to resolve', function(done) {
        registry.getNextUpdatePromise().then(function() {
          expect(updateCalled).toBe(true);
          expect(readCalled).toBe(true);
          return done();
        });

        registry.updateDocument(() => updateCalled = true);
        return registry.readDocument(() => readCalled = true);
      });
    })
  );
});
