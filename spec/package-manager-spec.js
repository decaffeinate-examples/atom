/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const Package = require('../src/package');
const temp = require('temp').track();
const fs = require('fs-plus');
const {Disposable} = require('atom');
const {buildKeydownEvent} = require('../src/keymap-extensions');
const {mockLocalStorage} = require('./spec-helper');
const ModuleCache = require('../src/module-cache');

describe("PackageManager", function() {
  const createTestElement = function(className) {
    const element = document.createElement('div');
    element.className = className;
    return element;
  };

  beforeEach(() => spyOn(ModuleCache, 'add'));

  afterEach(() => temp.cleanupSync());

  describe("::getApmPath()", function() {
    it("returns the path to the apm command", function() {
      let apmPath = path.join(process.resourcesPath, "app", "apm", "bin", "apm");
      if (process.platform === 'win32') {
        apmPath += ".cmd";
      }
      return expect(atom.packages.getApmPath()).toBe(apmPath);
    });

    return describe("when the core.apmPath setting is set", function() {
      beforeEach(() => atom.config.set("core.apmPath", "/path/to/apm"));

      return it("returns the value of the core.apmPath config setting", () => expect(atom.packages.getApmPath()).toBe("/path/to/apm"));
    });
  });

  describe("::loadPackages()", function() {
    beforeEach(() => spyOn(atom.packages, 'loadAvailablePackage'));

    afterEach(function() {
      atom.packages.deactivatePackages();
      return atom.packages.unloadPackages();
    });

    return it("sets hasLoadedInitialPackages", function() {
      expect(atom.packages.hasLoadedInitialPackages()).toBe(false);
      atom.packages.loadPackages();
      return expect(atom.packages.hasLoadedInitialPackages()).toBe(true);
    });
  });

  describe("::loadPackage(name)", function() {
    beforeEach(() => atom.config.set("core.disabledPackages", []));

    it("returns the package", function() {
      const pack = atom.packages.loadPackage("package-with-index");
      expect(pack instanceof Package).toBe(true);
      return expect(pack.metadata.name).toBe("package-with-index");
    });

    it("returns the package if it has an invalid keymap", function() {
      spyOn(atom, 'inSpecMode').andReturn(false);
      const pack = atom.packages.loadPackage("package-with-broken-keymap");
      expect(pack instanceof Package).toBe(true);
      return expect(pack.metadata.name).toBe("package-with-broken-keymap");
    });

    it("returns the package if it has an invalid stylesheet", function() {
      spyOn(atom, 'inSpecMode').andReturn(false);
      const pack = atom.packages.loadPackage("package-with-invalid-styles");
      expect(pack instanceof Package).toBe(true);
      expect(pack.metadata.name).toBe("package-with-invalid-styles");
      expect(pack.stylesheets.length).toBe(0);

      const addErrorHandler = jasmine.createSpy();
      atom.notifications.onDidAddNotification(addErrorHandler);
      expect(() => pack.reloadStylesheets()).not.toThrow();
      expect(addErrorHandler.callCount).toBe(2);
      expect(addErrorHandler.argsForCall[1][0].message).toContain("Failed to reload the package-with-invalid-styles package stylesheets");
      return expect(addErrorHandler.argsForCall[1][0].options.packageName).toEqual("package-with-invalid-styles");
    });

    it("returns null if the package has an invalid package.json", function() {
      spyOn(atom, 'inSpecMode').andReturn(false);
      const addErrorHandler = jasmine.createSpy();
      atom.notifications.onDidAddNotification(addErrorHandler);
      expect(atom.packages.loadPackage("package-with-broken-package-json")).toBeNull();
      expect(addErrorHandler.callCount).toBe(1);
      expect(addErrorHandler.argsForCall[0][0].message).toContain("Failed to load the package-with-broken-package-json package");
      return expect(addErrorHandler.argsForCall[0][0].options.packageName).toEqual("package-with-broken-package-json");
    });

    it("returns null if the package name or path starts with a dot", () => expect(atom.packages.loadPackage("/Users/user/.atom/packages/.git")).toBeNull());

    it("normalizes short repository urls in package.json", function() {
      let {metadata} = atom.packages.loadPackage("package-with-short-url-package-json");
      expect(metadata.repository.type).toBe("git");
      expect(metadata.repository.url).toBe("https://github.com/example/repo");

      ({metadata} = atom.packages.loadPackage("package-with-invalid-url-package-json"));
      expect(metadata.repository.type).toBe("git");
      return expect(metadata.repository.url).toBe("foo");
    });

    it("trims git+ from the beginning and .git from the end of repository URLs, even if npm already normalized them ", function() {
      const {metadata} = atom.packages.loadPackage("package-with-prefixed-and-suffixed-repo-url");
      expect(metadata.repository.type).toBe("git");
      return expect(metadata.repository.url).toBe("https://github.com/example/repo");
    });

    it("returns null if the package is not found in any package directory", function() {
      spyOn(console, 'warn');
      expect(atom.packages.loadPackage("this-package-cannot-be-found")).toBeNull();
      expect(console.warn.callCount).toBe(1);
      return expect(console.warn.argsForCall[0][0]).toContain("Could not resolve");
    });

    describe("when the package is deprecated", () =>
      it("returns null", function() {
        spyOn(console, 'warn');
        expect(atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'packages', 'wordcount'))).toBeNull();
        expect(atom.packages.isDeprecatedPackage('wordcount', '2.1.9')).toBe(true);
        expect(atom.packages.isDeprecatedPackage('wordcount', '2.2.0')).toBe(true);
        expect(atom.packages.isDeprecatedPackage('wordcount', '2.2.1')).toBe(false);
        return expect(atom.packages.getDeprecatedPackageMetadata('wordcount').version).toBe('<=2.2.0');
      })
    );

    it("invokes ::onDidLoadPackage listeners with the loaded package", function() {
      let loadedPackage = null;
      atom.packages.onDidLoadPackage(pack => loadedPackage = pack);

      atom.packages.loadPackage("package-with-main");

      return expect(loadedPackage.name).toBe("package-with-main");
    });

    it("registers any deserializers specified in the package's package.json", function() {
      const pack = atom.packages.loadPackage("package-with-deserializers");

      const state1 = {deserializer: 'Deserializer1', a: 'b'};
      expect(atom.deserializers.deserialize(state1)).toEqual({
        wasDeserializedBy: 'deserializeMethod1',
        state: state1
      });

      const state2 = {deserializer: 'Deserializer2', c: 'd'};
      return expect(atom.deserializers.deserialize(state2)).toEqual({
        wasDeserializedBy: 'deserializeMethod2',
        state: state2
      });
  });

    it("early-activates any atom.directory-provider or atom.repository-provider services that the package provide", function() {
      jasmine.useRealClock();

      const providers = [];
      atom.packages.serviceHub.consume('atom.directory-provider', '^0.1.0', provider => providers.push(provider));

      atom.packages.loadPackage('package-with-directory-provider');
      return expect(providers.map(p => p.name)).toEqual(['directory provider from package-with-directory-provider']);
    });

    describe("when there are view providers specified in the package's package.json", function() {
      const model1 = {worksWithViewProvider1: true};
      const model2 = {worksWithViewProvider2: true};

      afterEach(function() {
        atom.packages.deactivatePackage('package-with-view-providers');
        return atom.packages.unloadPackage('package-with-view-providers');
      });

      it("does not load the view providers immediately", function() {
        const pack = atom.packages.loadPackage("package-with-view-providers");
        expect(pack.mainModule).toBeNull();

        expect(() => atom.views.getView(model1)).toThrow();
        return expect(() => atom.views.getView(model2)).toThrow();
      });

      it("registers the view providers when the package is activated", function() {
        const pack = atom.packages.loadPackage("package-with-view-providers");

        return waitsForPromise(() =>
          atom.packages.activatePackage("package-with-view-providers").then(function() {
            const element1 = atom.views.getView(model1);
            expect(element1 instanceof HTMLDivElement).toBe(true);
            expect(element1.dataset.createdBy).toBe('view-provider-1');

            const element2 = atom.views.getView(model2);
            expect(element2 instanceof HTMLDivElement).toBe(true);
            return expect(element2.dataset.createdBy).toBe('view-provider-2');
          })
        );
      });

      return it("registers the view providers when any of the package's deserializers are used", function() {
        const pack = atom.packages.loadPackage("package-with-view-providers");

        spyOn(atom.views, 'addViewProvider').andCallThrough();
        atom.deserializers.deserialize({
          deserializer: 'DeserializerFromPackageWithViewProviders',
          a: 'b'
        });
        expect(atom.views.addViewProvider.callCount).toBe(2);

        atom.deserializers.deserialize({
          deserializer: 'DeserializerFromPackageWithViewProviders',
          a: 'b'
        });
        expect(atom.views.addViewProvider.callCount).toBe(2);

        const element1 = atom.views.getView(model1);
        expect(element1 instanceof HTMLDivElement).toBe(true);
        expect(element1.dataset.createdBy).toBe('view-provider-1');

        const element2 = atom.views.getView(model2);
        expect(element2 instanceof HTMLDivElement).toBe(true);
        return expect(element2.dataset.createdBy).toBe('view-provider-2');
      });
    });

    it("registers the config schema in the package's metadata, if present", function() {
      let pack = atom.packages.loadPackage("package-with-json-config-schema");
      expect(atom.config.getSchema('package-with-json-config-schema')).toEqual({
        type: 'object',
        properties: {
          a: {type: 'number', default: 5},
          b: {type: 'string', default: 'five'}
        }
      });

      expect(pack.mainModule).toBeNull();

      atom.packages.unloadPackage('package-with-json-config-schema');
      atom.config.clear();

      pack = atom.packages.loadPackage("package-with-json-config-schema");
      return expect(atom.config.getSchema('package-with-json-config-schema')).toEqual({
        type: 'object',
        properties: {
          a: {type: 'number', default: 5},
          b: {type: 'string', default: 'five'}
        }
      });
  });

    return describe("when a package does not have deserializers, view providers or a config schema in its package.json", function() {
      beforeEach(() => mockLocalStorage());

      it("defers loading the package's main module if the package previously used no Atom APIs when its main module was required", function() {
        const pack1 = atom.packages.loadPackage('package-with-main');
        expect(pack1.mainModule).toBeDefined();

        atom.packages.unloadPackage('package-with-main');

        const pack2 = atom.packages.loadPackage('package-with-main');
        return expect(pack2.mainModule).toBeNull();
      });

      return it("does not defer loading the package's main module if the package previously used Atom APIs when its main module was required", function() {
        const pack1 = atom.packages.loadPackage('package-with-eval-time-api-calls');
        expect(pack1.mainModule).toBeDefined();

        atom.packages.unloadPackage('package-with-eval-time-api-calls');

        const pack2 = atom.packages.loadPackage('package-with-eval-time-api-calls');
        return expect(pack2.mainModule).not.toBeNull();
      });
    });
  });

  describe("::loadAvailablePackage(availablePackage)", function() {
    describe("if the package was preloaded", function() {
      it("adds the package path to the module cache", function() {
        const availablePackage = atom.packages.getAvailablePackages().find(p => p.name === 'spell-check');
        availablePackage.isBundled = true;
        expect(atom.packages.preloadedPackages[availablePackage.name]).toBeUndefined();
        expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(false);

        const metadata = atom.packages.loadPackageMetadata(availablePackage);
        atom.packages.preloadPackage(
          availablePackage.name,
          {
            rootDirPath: path.relative(atom.packages.resourcePath, availablePackage.path),
            metadata
          }
        );
        atom.packages.loadAvailablePackage(availablePackage);
        expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(true);
        return expect(ModuleCache.add).toHaveBeenCalledWith(availablePackage.path, metadata);
      });

      it("deactivates it if it had been disabled", function() {
        const availablePackage = atom.packages.getAvailablePackages().find(p => p.name === 'spell-check');
        availablePackage.isBundled = true;
        expect(atom.packages.preloadedPackages[availablePackage.name]).toBeUndefined();
        expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(false);

        const metadata = atom.packages.loadPackageMetadata(availablePackage);
        const preloadedPackage = atom.packages.preloadPackage(
          availablePackage.name,
          {
            rootDirPath: path.relative(atom.packages.resourcePath, availablePackage.path),
            metadata
          }
        );
        expect(preloadedPackage.keymapActivated).toBe(true);
        expect(preloadedPackage.settingsActivated).toBe(true);
        expect(preloadedPackage.menusActivated).toBe(true);

        atom.packages.loadAvailablePackage(availablePackage, new Set([availablePackage.name]));
        expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(false);
        expect(preloadedPackage.keymapActivated).toBe(false);
        expect(preloadedPackage.settingsActivated).toBe(false);
        return expect(preloadedPackage.menusActivated).toBe(false);
      });

      return it("deactivates it and reloads the new one if trying to load the same package outside of the bundle", function() {
        const availablePackage = atom.packages.getAvailablePackages().find(p => p.name === 'spell-check');
        availablePackage.isBundled = true;
        expect(atom.packages.preloadedPackages[availablePackage.name]).toBeUndefined();
        expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(false);

        const metadata = atom.packages.loadPackageMetadata(availablePackage);
        const preloadedPackage = atom.packages.preloadPackage(
          availablePackage.name,
          {
            rootDirPath: path.relative(atom.packages.resourcePath, availablePackage.path),
            metadata
          }
        );
        expect(preloadedPackage.keymapActivated).toBe(true);
        expect(preloadedPackage.settingsActivated).toBe(true);
        expect(preloadedPackage.menusActivated).toBe(true);

        availablePackage.isBundled = false;
        atom.packages.loadAvailablePackage(availablePackage);
        expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(true);
        expect(preloadedPackage.keymapActivated).toBe(false);
        expect(preloadedPackage.settingsActivated).toBe(false);
        return expect(preloadedPackage.menusActivated).toBe(false);
      });
    });

    return describe("if the package was not preloaded", () =>
      it("adds the package path to the module cache", function() {
        const availablePackage = atom.packages.getAvailablePackages().find(p => p.name === 'spell-check');
        availablePackage.isBundled = true;
        const metadata = atom.packages.loadPackageMetadata(availablePackage);
        atom.packages.loadAvailablePackage(availablePackage);
        return expect(ModuleCache.add).toHaveBeenCalledWith(availablePackage.path, metadata);
      })
    );
  });

  describe("preloading", function() {
    it("requires the main module, loads the config schema and activates keymaps, menus and settings without reactivating them during package activation", function() {
      const availablePackage = atom.packages.getAvailablePackages().find(p => p.name === 'spell-check');
      availablePackage.isBundled = true;
      const metadata = atom.packages.loadPackageMetadata(availablePackage);
      expect(atom.packages.preloadedPackages[availablePackage.name]).toBeUndefined();
      expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(false);

      atom.packages.packagesCache = {};
      atom.packages.packagesCache[availablePackage.name] = {
        main: path.join(availablePackage.path, metadata.main),
        grammarPaths: []
      };
      const preloadedPackage = atom.packages.preloadPackage(
        availablePackage.name,
        {
          rootDirPath: path.relative(atom.packages.resourcePath, availablePackage.path),
          metadata
        }
      );
      expect(preloadedPackage.keymapActivated).toBe(true);
      expect(preloadedPackage.settingsActivated).toBe(true);
      expect(preloadedPackage.menusActivated).toBe(true);
      expect(preloadedPackage.mainModule).toBeTruthy();
      expect(preloadedPackage.configSchemaRegisteredOnLoad).toBeTruthy();

      spyOn(atom.keymaps, 'add');
      spyOn(atom.menu, 'add');
      spyOn(atom.contextMenu, 'add');
      spyOn(atom.config, 'setSchema');

      atom.packages.loadAvailablePackage(availablePackage);
      expect(preloadedPackage.getMainModulePath()).toBe(path.join(availablePackage.path, metadata.main));

      atom.packages.activatePackage(availablePackage.name);
      expect(atom.keymaps.add).not.toHaveBeenCalled();
      expect(atom.menu.add).not.toHaveBeenCalled();
      expect(atom.contextMenu.add).not.toHaveBeenCalled();
      expect(atom.config.setSchema).not.toHaveBeenCalled();
      expect(preloadedPackage.keymapActivated).toBe(true);
      expect(preloadedPackage.settingsActivated).toBe(true);
      expect(preloadedPackage.menusActivated).toBe(true);
      expect(preloadedPackage.mainModule).toBeTruthy();
      return expect(preloadedPackage.configSchemaRegisteredOnLoad).toBeTruthy();
    });

    return it("deactivates disabled keymaps during package activation", function() {
      const availablePackage = atom.packages.getAvailablePackages().find(p => p.name === 'spell-check');
      availablePackage.isBundled = true;
      const metadata = atom.packages.loadPackageMetadata(availablePackage);
      expect(atom.packages.preloadedPackages[availablePackage.name]).toBeUndefined();
      expect(atom.packages.isPackageLoaded(availablePackage.name)).toBe(false);

      atom.packages.packagesCache = {};
      atom.packages.packagesCache[availablePackage.name] = {
        main: path.join(availablePackage.path, metadata.main),
        grammarPaths: []
      };
      const preloadedPackage = atom.packages.preloadPackage(
        availablePackage.name,
        {
          rootDirPath: path.relative(atom.packages.resourcePath, availablePackage.path),
          metadata
        }
      );
      expect(preloadedPackage.keymapActivated).toBe(true);
      expect(preloadedPackage.settingsActivated).toBe(true);
      expect(preloadedPackage.menusActivated).toBe(true);

      atom.packages.loadAvailablePackage(availablePackage);
      atom.config.set("core.packagesWithKeymapsDisabled", [availablePackage.name]);
      atom.packages.activatePackage(availablePackage.name);

      expect(preloadedPackage.keymapActivated).toBe(false);
      expect(preloadedPackage.settingsActivated).toBe(true);
      return expect(preloadedPackage.menusActivated).toBe(true);
    });
  });

  describe("::unloadPackage(name)", function() {
    describe("when the package is active", () =>
      it("throws an error", function() {
        let pack = null;
        waitsForPromise(() => atom.packages.activatePackage('package-with-main').then(p => pack = p));

        return runs(function() {
          expect(atom.packages.isPackageLoaded(pack.name)).toBeTruthy();
          expect(atom.packages.isPackageActive(pack.name)).toBeTruthy();
          expect( () => atom.packages.unloadPackage(pack.name)).toThrow();
          expect(atom.packages.isPackageLoaded(pack.name)).toBeTruthy();
          return expect(atom.packages.isPackageActive(pack.name)).toBeTruthy();
        });
      })
    );

    describe("when the package is not loaded", () =>
      it("throws an error", function() {
        expect(atom.packages.isPackageLoaded('unloaded')).toBeFalsy();
        expect( () => atom.packages.unloadPackage('unloaded')).toThrow();
        return expect(atom.packages.isPackageLoaded('unloaded')).toBeFalsy();
      })
    );

    describe("when the package is loaded", () =>
      it("no longers reports it as being loaded", function() {
        const pack = atom.packages.loadPackage('package-with-main');
        expect(atom.packages.isPackageLoaded(pack.name)).toBeTruthy();
        atom.packages.unloadPackage(pack.name);
        return expect(atom.packages.isPackageLoaded(pack.name)).toBeFalsy();
      })
    );

    return it("invokes ::onDidUnloadPackage listeners with the unloaded package", function() {
      atom.packages.loadPackage('package-with-main');
      let unloadedPackage = null;
      atom.packages.onDidUnloadPackage(pack => unloadedPackage = pack);
      atom.packages.unloadPackage('package-with-main');
      return expect(unloadedPackage.name).toBe('package-with-main');
    });
  });

  describe("::activatePackage(id)", function() {
    describe("when called multiple times", () =>
      it("it only calls activate on the package once", function() {
        spyOn(Package.prototype, 'activateNow').andCallThrough();
        waitsForPromise(() => atom.packages.activatePackage('package-with-index'));
        waitsForPromise(() => atom.packages.activatePackage('package-with-index'));
        waitsForPromise(() => atom.packages.activatePackage('package-with-index'));

        return runs(() => expect(Package.prototype.activateNow.callCount).toBe(1));
      })
    );

    describe("when the package has a main module", function() {
      describe("when the metadata specifies a main module path˜", () =>
        it("requires the module at the specified path", function() {
          const mainModule = require('./fixtures/packages/package-with-main/main-module');
          spyOn(mainModule, 'activate');
          let pack = null;
          waitsForPromise(() => atom.packages.activatePackage('package-with-main').then(p => pack = p));

          return runs(function() {
            expect(mainModule.activate).toHaveBeenCalled();
            return expect(pack.mainModule).toBe(mainModule);
          });
        })
      );

      describe("when the metadata does not specify a main module", () =>
        it("requires index.coffee", function() {
          const indexModule = require('./fixtures/packages/package-with-index/index');
          spyOn(indexModule, 'activate');
          let pack = null;
          waitsForPromise(() => atom.packages.activatePackage('package-with-index').then(p => pack = p));

          return runs(function() {
            expect(indexModule.activate).toHaveBeenCalled();
            return expect(pack.mainModule).toBe(indexModule);
          });
        })
      );

      it("assigns config schema, including defaults when package contains a schema", function() {
        expect(atom.config.get('package-with-config-schema.numbers.one')).toBeUndefined();

        waitsForPromise(() => atom.packages.activatePackage('package-with-config-schema'));

        return runs(function() {
          expect(atom.config.get('package-with-config-schema.numbers.one')).toBe(1);
          expect(atom.config.get('package-with-config-schema.numbers.two')).toBe(2);

          expect(atom.config.set('package-with-config-schema.numbers.one', 'nope')).toBe(false);
          expect(atom.config.set('package-with-config-schema.numbers.one', '10')).toBe(true);
          return expect(atom.config.get('package-with-config-schema.numbers.one')).toBe(10);
        });
      });

      return describe("when the package metadata includes `activationCommands`", function() {
        let [mainModule, promise, workspaceCommandListener, registration] = Array.from([]);

        beforeEach(function() {
          jasmine.attachToDOM(atom.workspace.getElement());
          mainModule = require('./fixtures/packages/package-with-activation-commands/index');
          mainModule.activationCommandCallCount = 0;
          spyOn(mainModule, 'activate').andCallThrough();
          spyOn(Package.prototype, 'requireMainModule').andCallThrough();

          workspaceCommandListener = jasmine.createSpy('workspaceCommandListener');
          registration = atom.commands.add('.workspace', 'activation-command', workspaceCommandListener);

          return promise = atom.packages.activatePackage('package-with-activation-commands');
        });

        afterEach(function() {
          if (registration != null) {
            registration.dispose();
          }
          return mainModule = null;
        });

        it("defers requiring/activating the main module until an activation event bubbles to the root view", function() {
          expect(Package.prototype.requireMainModule.callCount).toBe(0);

          atom.workspace.getElement().dispatchEvent(new CustomEvent('activation-command', {bubbles: true}));

          waitsForPromise(() => promise);

          return runs(() => expect(Package.prototype.requireMainModule.callCount).toBe(1));
        });

        it("triggers the activation event on all handlers registered during activation", function() {
          waitsForPromise(() => atom.workspace.open());

          return runs(function() {
            const editorElement = atom.workspace.getActiveTextEditor().getElement();
            const editorCommandListener = jasmine.createSpy("editorCommandListener");
            atom.commands.add('atom-text-editor', 'activation-command', editorCommandListener);
            atom.commands.dispatch(editorElement, 'activation-command');
            expect(mainModule.activate.callCount).toBe(1);
            expect(mainModule.activationCommandCallCount).toBe(1);
            expect(editorCommandListener.callCount).toBe(1);
            expect(workspaceCommandListener.callCount).toBe(1);
            atom.commands.dispatch(editorElement, 'activation-command');
            expect(mainModule.activationCommandCallCount).toBe(2);
            expect(editorCommandListener.callCount).toBe(2);
            expect(workspaceCommandListener.callCount).toBe(2);
            return expect(mainModule.activate.callCount).toBe(1);
          });
        });

        it("activates the package immediately when the events are empty", function() {
          mainModule = require('./fixtures/packages/package-with-empty-activation-commands/index');
          spyOn(mainModule, 'activate').andCallThrough();

          waitsForPromise(() => atom.packages.activatePackage('package-with-empty-activation-commands'));

          return runs(() => expect(mainModule.activate.callCount).toBe(1));
        });

        it("adds a notification when the activation commands are invalid", function() {
          spyOn(atom, 'inSpecMode').andReturn(false);
          const addErrorHandler = jasmine.createSpy();
          atom.notifications.onDidAddNotification(addErrorHandler);
          expect(() => atom.packages.activatePackage('package-with-invalid-activation-commands')).not.toThrow();
          expect(addErrorHandler.callCount).toBe(1);
          expect(addErrorHandler.argsForCall[0][0].message).toContain("Failed to activate the package-with-invalid-activation-commands package");
          return expect(addErrorHandler.argsForCall[0][0].options.packageName).toEqual("package-with-invalid-activation-commands");
        });

        it("adds a notification when the context menu is invalid", function() {
          spyOn(atom, 'inSpecMode').andReturn(false);
          const addErrorHandler = jasmine.createSpy();
          atom.notifications.onDidAddNotification(addErrorHandler);
          expect(() => atom.packages.activatePackage('package-with-invalid-context-menu')).not.toThrow();
          expect(addErrorHandler.callCount).toBe(1);
          expect(addErrorHandler.argsForCall[0][0].message).toContain("Failed to activate the package-with-invalid-context-menu package");
          return expect(addErrorHandler.argsForCall[0][0].options.packageName).toEqual("package-with-invalid-context-menu");
        });

        it("adds a notification when the grammar is invalid", function() {
          const addErrorHandler = jasmine.createSpy();
          atom.notifications.onDidAddNotification(addErrorHandler);

          expect(() => atom.packages.activatePackage('package-with-invalid-grammar')).not.toThrow();

          waitsFor(() => addErrorHandler.callCount > 0);

          return runs(function() {
            expect(addErrorHandler.callCount).toBe(1);
            expect(addErrorHandler.argsForCall[0][0].message).toContain("Failed to load a package-with-invalid-grammar package grammar");
            return expect(addErrorHandler.argsForCall[0][0].options.packageName).toEqual("package-with-invalid-grammar");
          });
        });

        return it("adds a notification when the settings are invalid", function() {
          const addErrorHandler = jasmine.createSpy();
          atom.notifications.onDidAddNotification(addErrorHandler);

          expect(() => atom.packages.activatePackage('package-with-invalid-settings')).not.toThrow();

          waitsFor(() => addErrorHandler.callCount > 0);

          return runs(function() {
            expect(addErrorHandler.callCount).toBe(1);
            expect(addErrorHandler.argsForCall[0][0].message).toContain("Failed to load the package-with-invalid-settings package settings");
            return expect(addErrorHandler.argsForCall[0][0].options.packageName).toEqual("package-with-invalid-settings");
          });
        });
      });
    });

    describe("when the package metadata includes `activationHooks`", function() {
      let [mainModule, promise] = Array.from([]);

      beforeEach(function() {
        mainModule = require('./fixtures/packages/package-with-activation-hooks/index');
        spyOn(mainModule, 'activate').andCallThrough();
        return spyOn(Package.prototype, 'requireMainModule').andCallThrough();
      });

      it("defers requiring/activating the main module until an triggering of an activation hook occurs", function() {
        promise = atom.packages.activatePackage('package-with-activation-hooks');
        expect(Package.prototype.requireMainModule.callCount).toBe(0);
        atom.packages.triggerActivationHook('language-fictitious:grammar-used');
        atom.packages.triggerDeferredActivationHooks();

        waitsForPromise(() => promise);

        return runs(() => expect(Package.prototype.requireMainModule.callCount).toBe(1));
      });

      it("does not double register activation hooks when deactivating and reactivating", function() {
        promise = atom.packages.activatePackage('package-with-activation-hooks');
        expect(mainModule.activate.callCount).toBe(0);
        atom.packages.triggerActivationHook('language-fictitious:grammar-used');
        atom.packages.triggerDeferredActivationHooks();

        waitsForPromise(() => promise);

        runs(function() {
          expect(mainModule.activate.callCount).toBe(1);
          atom.packages.deactivatePackage('package-with-activation-hooks');
          promise = atom.packages.activatePackage('package-with-activation-hooks');
          atom.packages.triggerActivationHook('language-fictitious:grammar-used');
          return atom.packages.triggerDeferredActivationHooks();
        });

        waitsForPromise(() => promise);

        return runs(() => expect(mainModule.activate.callCount).toBe(2));
      });

      it("activates the package immediately when activationHooks is empty", function() {
        mainModule = require('./fixtures/packages/package-with-empty-activation-hooks/index');
        spyOn(mainModule, 'activate').andCallThrough();

        runs(() => expect(Package.prototype.requireMainModule.callCount).toBe(0));

        waitsForPromise(() => atom.packages.activatePackage('package-with-empty-activation-hooks'));

        return runs(function() {
          expect(mainModule.activate.callCount).toBe(1);
          return expect(Package.prototype.requireMainModule.callCount).toBe(1);
        });
      });

      return it("activates the package immediately if the activation hook had already been triggered", function() {
        atom.packages.triggerActivationHook('language-fictitious:grammar-used');
        atom.packages.triggerDeferredActivationHooks();
        expect(Package.prototype.requireMainModule.callCount).toBe(0);

        waitsForPromise(() => atom.packages.activatePackage('package-with-activation-hooks'));

        return runs(() => expect(Package.prototype.requireMainModule.callCount).toBe(1));
      });
    });

    describe("when the package has no main module", () =>
      it("does not throw an exception", function() {
        spyOn(console, "error");
        spyOn(console, "warn").andCallThrough();
        expect(() => atom.packages.activatePackage('package-without-module')).not.toThrow();
        expect(console.error).not.toHaveBeenCalled();
        return expect(console.warn).not.toHaveBeenCalled();
      })
    );

    describe("when the package does not export an activate function", () =>
      it("activates the package and does not throw an exception or log a warning", function() {
        spyOn(console, "warn");
        expect(() => atom.packages.activatePackage('package-with-no-activate')).not.toThrow();

        waitsFor(() => atom.packages.isPackageActive('package-with-no-activate'));

        return runs(() => expect(console.warn).not.toHaveBeenCalled());
      })
    );

    it("passes the activate method the package's previously serialized state if it exists", function() {
      let pack = null;
      waitsForPromise(() => atom.packages.activatePackage("package-with-serialization").then(p => pack = p));
      runs(function() {
        expect(pack.mainModule.someNumber).not.toBe(77);
        pack.mainModule.someNumber = 77;
        atom.packages.serializePackage("package-with-serialization");
        atom.packages.deactivatePackage("package-with-serialization");
        return spyOn(pack.mainModule, 'activate').andCallThrough();
      });
      waitsForPromise(() => atom.packages.activatePackage("package-with-serialization"));
      return runs(() => expect(pack.mainModule.activate).toHaveBeenCalledWith({someNumber: 77}));
    });

    it("invokes ::onDidActivatePackage listeners with the activated package", function() {
      let activatedPackage = null;
      atom.packages.onDidActivatePackage(pack => activatedPackage = pack);

      atom.packages.activatePackage('package-with-main');

      waitsFor(() => activatedPackage != null);
      return runs(() => expect(activatedPackage.name).toBe('package-with-main'));
    });

    describe("when the package's main module throws an error on load", function() {
      it("adds a notification instead of throwing an exception", function() {
        spyOn(atom, 'inSpecMode').andReturn(false);
        atom.config.set("core.disabledPackages", []);
        const addErrorHandler = jasmine.createSpy();
        atom.notifications.onDidAddNotification(addErrorHandler);
        expect(() => atom.packages.activatePackage("package-that-throws-an-exception")).not.toThrow();
        expect(addErrorHandler.callCount).toBe(1);
        expect(addErrorHandler.argsForCall[0][0].message).toContain("Failed to load the package-that-throws-an-exception package");
        return expect(addErrorHandler.argsForCall[0][0].options.packageName).toEqual("package-that-throws-an-exception");
      });

      return it("re-throws the exception in test mode", function() {
        atom.config.set("core.disabledPackages", []);
        const addErrorHandler = jasmine.createSpy();
        return expect(() => atom.packages.activatePackage("package-that-throws-an-exception")).toThrow("This package throws an exception");
      });
    });

    describe("when the package is not found", () =>
      it("rejects the promise", function() {
        atom.config.set("core.disabledPackages", []);

        const onSuccess = jasmine.createSpy('onSuccess');
        const onFailure = jasmine.createSpy('onFailure');
        spyOn(console, 'warn');

        atom.packages.activatePackage("this-doesnt-exist").then(onSuccess, onFailure);

        waitsFor("promise to be rejected", () => onFailure.callCount > 0);

        return runs(function() {
          expect(console.warn.callCount).toBe(1);
          expect(onFailure.mostRecentCall.args[0] instanceof Error).toBe(true);
          return expect(onFailure.mostRecentCall.args[0].message).toContain("Failed to load package 'this-doesnt-exist'");
        });
      })
    );

    describe("keymap loading", function() {
      describe("when the metadata does not contain a 'keymaps' manifest", () =>
        it("loads all the .cson/.json files in the keymaps directory", function() {
          const element1 = createTestElement('test-1');
          const element2 = createTestElement('test-2');
          const element3 = createTestElement('test-3');

          expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})).toHaveLength(0);
          expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element2})).toHaveLength(0);
          expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element3})).toHaveLength(0);

          waitsForPromise(() => atom.packages.activatePackage("package-with-keymaps"));

          return runs(function() {
            expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})[0].command).toBe("test-1");
            expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element2})[0].command).toBe("test-2");
            return expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element3})).toHaveLength(0);
          });
        })
      );

      describe("when the metadata contains a 'keymaps' manifest", () =>
        it("loads only the keymaps specified by the manifest, in the specified order", function() {
          const element1 = createTestElement('test-1');
          const element3 = createTestElement('test-3');

          expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})).toHaveLength(0);

          waitsForPromise(() => atom.packages.activatePackage("package-with-keymaps-manifest"));

          return runs(function() {
            expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})[0].command).toBe('keymap-1');
            expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-n', target: element1})[0].command).toBe('keymap-2');
            return expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-y', target: element3})).toHaveLength(0);
          });
        })
      );

      describe("when the keymap file is empty", () =>
        it("does not throw an error on activation", function() {
          waitsForPromise(() => atom.packages.activatePackage("package-with-empty-keymap"));

          return runs(() => expect(atom.packages.isPackageActive("package-with-empty-keymap")).toBe(true));
        })
      );

      describe("when the package's keymaps have been disabled", () =>
        it("does not add the keymaps", function() {
          const element1 = createTestElement('test-1');

          expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})).toHaveLength(0);

          atom.config.set("core.packagesWithKeymapsDisabled", ["package-with-keymaps-manifest"]);

          waitsForPromise(() => atom.packages.activatePackage("package-with-keymaps-manifest"));

          return runs(() => expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})).toHaveLength(0));
        })
      );

      describe("when setting core.packagesWithKeymapsDisabled", () =>
        it("ignores package names in the array that aren't loaded", function() {
          atom.packages.observePackagesWithKeymapsDisabled();

          expect(() => atom.config.set("core.packagesWithKeymapsDisabled", ["package-does-not-exist"])).not.toThrow();
          return expect(() => atom.config.set("core.packagesWithKeymapsDisabled", [])).not.toThrow();
        })
      );

      describe("when the package's keymaps are disabled and re-enabled after it is activated", () =>
        it("removes and re-adds the keymaps", function() {
          const element1 = createTestElement('test-1');
          atom.packages.observePackagesWithKeymapsDisabled();

          waitsForPromise(() => atom.packages.activatePackage("package-with-keymaps-manifest"));

          return runs(function() {
            atom.config.set("core.packagesWithKeymapsDisabled", ['package-with-keymaps-manifest']);
            expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})).toHaveLength(0);

            atom.config.set("core.packagesWithKeymapsDisabled", []);
            return expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: element1})[0].command).toBe('keymap-1');
          });
        })
      );

      return describe("when the package is de-activated and re-activated", function() {
        let [element, events, userKeymapPath] = Array.from([]);

        beforeEach(function() {
          userKeymapPath = path.join(temp.mkdirSync(), "user-keymaps.cson");
          spyOn(atom.keymaps, "getUserKeymapPath").andReturn(userKeymapPath);

          element = createTestElement('test-1');
          jasmine.attachToDOM(element);

          events = [];
          element.addEventListener('user-command', e => events.push(e));
          return element.addEventListener('test-1', e => events.push(e));
        });

        afterEach(function() {
          element.remove();

          // Avoid leaking user keymap subscription
          atom.keymaps.watchSubscriptions[userKeymapPath].dispose();
          delete atom.keymaps.watchSubscriptions[userKeymapPath];

          return temp.cleanupSync();
        });

        return it("doesn't override user-defined keymaps", function() {
          fs.writeFileSync(userKeymapPath, `\
".test-1":
  "ctrl-z": "user-command"\
`
          );
          atom.keymaps.loadUserKeymap();

          waitsForPromise(() => atom.packages.activatePackage("package-with-keymaps"));

          runs(function() {
            atom.keymaps.handleKeyboardEvent(buildKeydownEvent("z", {ctrl: true, target: element}));

            expect(events.length).toBe(1);
            expect(events[0].type).toBe("user-command");

            return atom.packages.deactivatePackage("package-with-keymaps");
          });

          waitsForPromise(() => atom.packages.activatePackage("package-with-keymaps"));

          return runs(function() {
            atom.keymaps.handleKeyboardEvent(buildKeydownEvent("z", {ctrl: true, target: element}));

            expect(events.length).toBe(2);
            return expect(events[1].type).toBe("user-command");
          });
        });
      });
    });

    describe("menu loading", function() {
      beforeEach(function() {
        atom.contextMenu.definitions = [];
        return atom.menu.template = [];});

      describe("when the metadata does not contain a 'menus' manifest", () =>
        it("loads all the .cson/.json files in the menus directory", function() {
          const element = createTestElement('test-1');

          expect(atom.contextMenu.templateForElement(element)).toEqual([]);

          waitsForPromise(() => atom.packages.activatePackage("package-with-menus"));

          return runs(function() {
            expect(atom.menu.template.length).toBe(2);
            expect(atom.menu.template[0].label).toBe("Second to Last");
            expect(atom.menu.template[1].label).toBe("Last");
            expect(atom.contextMenu.templateForElement(element)[0].label).toBe("Menu item 1");
            expect(atom.contextMenu.templateForElement(element)[1].label).toBe("Menu item 2");
            return expect(atom.contextMenu.templateForElement(element)[2].label).toBe("Menu item 3");
          });
        })
      );

      describe("when the metadata contains a 'menus' manifest", () =>
        it("loads only the menus specified by the manifest, in the specified order", function() {
          const element = createTestElement('test-1');

          expect(atom.contextMenu.templateForElement(element)).toEqual([]);

          waitsForPromise(() => atom.packages.activatePackage("package-with-menus-manifest"));

          return runs(function() {
            expect(atom.menu.template[0].label).toBe("Second to Last");
            expect(atom.menu.template[1].label).toBe("Last");
            expect(atom.contextMenu.templateForElement(element)[0].label).toBe("Menu item 2");
            expect(atom.contextMenu.templateForElement(element)[1].label).toBe("Menu item 1");
            return expect(atom.contextMenu.templateForElement(element)[2]).toBeUndefined();
          });
        })
      );

      return describe("when the menu file is empty", () =>
        it("does not throw an error on activation", function() {
          waitsForPromise(() => atom.packages.activatePackage("package-with-empty-menu"));

          return runs(() => expect(atom.packages.isPackageActive("package-with-empty-menu")).toBe(true));
        })
      );
    });

    describe("stylesheet loading", function() {
      describe("when the metadata contains a 'styleSheets' manifest", () =>
        it("loads style sheets from the styles directory as specified by the manifest", function() {
          const one = require.resolve("./fixtures/packages/package-with-style-sheets-manifest/styles/1.css");
          const two = require.resolve("./fixtures/packages/package-with-style-sheets-manifest/styles/2.less");
          const three = require.resolve("./fixtures/packages/package-with-style-sheets-manifest/styles/3.css");

          expect(atom.themes.stylesheetElementForId(one)).toBeNull();
          expect(atom.themes.stylesheetElementForId(two)).toBeNull();
          expect(atom.themes.stylesheetElementForId(three)).toBeNull();

          waitsForPromise(() => atom.packages.activatePackage("package-with-style-sheets-manifest"));

          return runs(function() {
            expect(atom.themes.stylesheetElementForId(one)).not.toBeNull();
            expect(atom.themes.stylesheetElementForId(two)).not.toBeNull();
            expect(atom.themes.stylesheetElementForId(three)).toBeNull();

            return expect(getComputedStyle(document.querySelector('#jasmine-content')).fontSize).toBe('1px');
          });
        })
      );

      describe("when the metadata does not contain a 'styleSheets' manifest", () =>
        it("loads all style sheets from the styles directory", function() {
          const one = require.resolve("./fixtures/packages/package-with-styles/styles/1.css");
          const two = require.resolve("./fixtures/packages/package-with-styles/styles/2.less");
          const three = require.resolve("./fixtures/packages/package-with-styles/styles/3.test-context.css");
          const four = require.resolve("./fixtures/packages/package-with-styles/styles/4.css");

          expect(atom.themes.stylesheetElementForId(one)).toBeNull();
          expect(atom.themes.stylesheetElementForId(two)).toBeNull();
          expect(atom.themes.stylesheetElementForId(three)).toBeNull();
          expect(atom.themes.stylesheetElementForId(four)).toBeNull();

          waitsForPromise(() => atom.packages.activatePackage("package-with-styles"));

          return runs(function() {
            expect(atom.themes.stylesheetElementForId(one)).not.toBeNull();
            expect(atom.themes.stylesheetElementForId(two)).not.toBeNull();
            expect(atom.themes.stylesheetElementForId(three)).not.toBeNull();
            expect(atom.themes.stylesheetElementForId(four)).not.toBeNull();
            return expect(getComputedStyle(document.querySelector('#jasmine-content')).fontSize).toBe('3px');
          });
        })
      );

      return it("assigns the stylesheet's context based on the filename", function() {
        waitsForPromise(() => atom.packages.activatePackage("package-with-styles"));

        return runs(function() {
          let count = 0;

          for (let styleElement of Array.from(atom.styles.getStyleElements())) {
            if (styleElement.sourcePath.match(/1.css/)) {
              expect(styleElement.context).toBe(undefined);
              count++;
            }

            if (styleElement.sourcePath.match(/2.less/)) {
              expect(styleElement.context).toBe(undefined);
              count++;
            }

            if (styleElement.sourcePath.match(/3.test-context.css/)) {
              expect(styleElement.context).toBe('test-context');
              count++;
            }

            if (styleElement.sourcePath.match(/4.css/)) {
              expect(styleElement.context).toBe(undefined);
              count++;
            }
          }

          return expect(count).toBe(4);
        });
      });
    });

    describe("grammar loading", () =>
      it("loads the package's grammars", function() {
        waitsForPromise(() => atom.packages.activatePackage('package-with-grammars'));

        return runs(function() {
          expect(atom.grammars.selectGrammar('a.alot').name).toBe('Alot');
          return expect(atom.grammars.selectGrammar('a.alittle').name).toBe('Alittle');
        });
      })
    );

    describe("scoped-property loading", () =>
      it("loads the scoped properties", function() {
        waitsForPromise(() => atom.packages.activatePackage("package-with-settings"));

        return runs(() => expect(atom.config.get('editor.increaseIndentPattern', {scope: ['.source.omg']})).toBe('^a'));
      })
    );

    return describe("service registration", function() {
      it("registers the package's provided and consumed services", function() {
        const consumerModule = require("./fixtures/packages/package-with-consumed-services");
        let firstServiceV3Disposed = false;
        let firstServiceV4Disposed = false;
        let secondServiceDisposed = false;
        spyOn(consumerModule, 'consumeFirstServiceV3').andReturn(new Disposable(function() { return firstServiceV3Disposed = true; }));
        spyOn(consumerModule, 'consumeFirstServiceV4').andReturn(new Disposable(function() { return firstServiceV4Disposed = true; }));
        spyOn(consumerModule, 'consumeSecondService').andReturn(new Disposable(function() { return secondServiceDisposed = true; }));

        waitsForPromise(() => atom.packages.activatePackage("package-with-consumed-services"));

        waitsForPromise(() => atom.packages.activatePackage("package-with-provided-services"));

        runs(function() {
          expect(consumerModule.consumeFirstServiceV3.callCount).toBe(1);
          expect(consumerModule.consumeFirstServiceV3).toHaveBeenCalledWith('first-service-v3');
          expect(consumerModule.consumeFirstServiceV4).toHaveBeenCalledWith('first-service-v4');
          expect(consumerModule.consumeSecondService).toHaveBeenCalledWith('second-service');

          consumerModule.consumeFirstServiceV3.reset();
          consumerModule.consumeFirstServiceV4.reset();
          consumerModule.consumeSecondService.reset();

          atom.packages.deactivatePackage("package-with-provided-services");

          expect(firstServiceV3Disposed).toBe(true);
          expect(firstServiceV4Disposed).toBe(true);
          expect(secondServiceDisposed).toBe(true);

          return atom.packages.deactivatePackage("package-with-consumed-services");
        });

        waitsForPromise(() => atom.packages.activatePackage("package-with-provided-services"));

        return runs(function() {
          expect(consumerModule.consumeFirstServiceV3).not.toHaveBeenCalled();
          expect(consumerModule.consumeFirstServiceV4).not.toHaveBeenCalled();
          return expect(consumerModule.consumeSecondService).not.toHaveBeenCalled();
        });
      });

      return it("ignores provided and consumed services that do not exist", function() {
        const addErrorHandler = jasmine.createSpy();
        atom.notifications.onDidAddNotification(addErrorHandler);

        waitsForPromise(() => atom.packages.activatePackage("package-with-missing-consumed-services"));

        waitsForPromise(() => atom.packages.activatePackage("package-with-missing-provided-services"));

        return runs(function() {
          expect(atom.packages.isPackageActive("package-with-missing-consumed-services")).toBe(true);
          expect(atom.packages.isPackageActive("package-with-missing-provided-services")).toBe(true);
          return expect(addErrorHandler.callCount).toBe(0);
        });
      });
    });
  });

  describe("::serialize", function() {
    it("does not serialize packages that threw an error during activation", function() {
      spyOn(atom, 'inSpecMode').andReturn(false);
      spyOn(console, 'warn');
      let badPack = null;
      waitsForPromise(() => atom.packages.activatePackage("package-that-throws-on-activate").then(p => badPack = p));

      return runs(function() {
        spyOn(badPack.mainModule, 'serialize').andCallThrough();

        atom.packages.serialize();
        return expect(badPack.mainModule.serialize).not.toHaveBeenCalled();
      });
    });

    return it("absorbs exceptions that are thrown by the package module's serialize method", function() {
      spyOn(console, 'error');

      waitsForPromise(() => atom.packages.activatePackage('package-with-serialize-error'));

      waitsForPromise(() => atom.packages.activatePackage('package-with-serialization'));

      return runs(function() {
        atom.packages.serialize();
        expect(atom.packages.packageStates['package-with-serialize-error']).toBeUndefined();
        expect(atom.packages.packageStates['package-with-serialization']).toEqual({someNumber: 1});
        return expect(console.error).toHaveBeenCalled();
      });
    });
  });

  describe("::deactivatePackages()", () =>
    it("deactivates all packages but does not serialize them", function() {
      let [pack1, pack2] = Array.from([]);

      waitsForPromise(function() {
        atom.packages.activatePackage("package-with-deactivate").then(p => pack1 = p);
        return atom.packages.activatePackage("package-with-serialization").then(p => pack2 = p);
      });

      return runs(function() {
        spyOn(pack1.mainModule, 'deactivate');
        spyOn(pack2.mainModule, 'serialize');
        atom.packages.deactivatePackages();

        expect(pack1.mainModule.deactivate).toHaveBeenCalled();
        return expect(pack2.mainModule.serialize).not.toHaveBeenCalled();
      });
    })
  );

  describe("::deactivatePackage(id)", function() {
    afterEach(() => atom.packages.unloadPackages());

    it("calls `deactivate` on the package's main module if activate was successful", function() {
      spyOn(atom, 'inSpecMode').andReturn(false);
      let pack = null;
      waitsForPromise(() => atom.packages.activatePackage("package-with-deactivate").then(p => pack = p));

      runs(function() {
        expect(atom.packages.isPackageActive("package-with-deactivate")).toBeTruthy();
        spyOn(pack.mainModule, 'deactivate').andCallThrough();

        atom.packages.deactivatePackage("package-with-deactivate");
        expect(pack.mainModule.deactivate).toHaveBeenCalled();
        expect(atom.packages.isPackageActive("package-with-module")).toBeFalsy();

        return spyOn(console, 'warn');
      });

      let badPack = null;
      waitsForPromise(() => atom.packages.activatePackage("package-that-throws-on-activate").then(p => badPack = p));

      return runs(function() {
        expect(atom.packages.isPackageActive("package-that-throws-on-activate")).toBeTruthy();
        spyOn(badPack.mainModule, 'deactivate').andCallThrough();

        atom.packages.deactivatePackage("package-that-throws-on-activate");
        expect(badPack.mainModule.deactivate).not.toHaveBeenCalled();
        return expect(atom.packages.isPackageActive("package-that-throws-on-activate")).toBeFalsy();
      });
    });

    it("absorbs exceptions that are thrown by the package module's deactivate method", function() {
      spyOn(console, 'error');

      waitsForPromise(() => atom.packages.activatePackage("package-that-throws-on-deactivate"));

      return runs(function() {
        expect(() => atom.packages.deactivatePackage("package-that-throws-on-deactivate")).not.toThrow();
        return expect(console.error).toHaveBeenCalled();
      });
    });

    it("removes the package's grammars", function() {
      waitsForPromise(() => atom.packages.activatePackage('package-with-grammars'));

      return runs(function() {
        atom.packages.deactivatePackage('package-with-grammars');
        expect(atom.grammars.selectGrammar('a.alot').name).toBe('Null Grammar');
        return expect(atom.grammars.selectGrammar('a.alittle').name).toBe('Null Grammar');
      });
    });

    it("removes the package's keymaps", function() {
      waitsForPromise(() => atom.packages.activatePackage('package-with-keymaps'));

      return runs(function() {
        atom.packages.deactivatePackage('package-with-keymaps');
        expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: createTestElement('test-1')})).toHaveLength(0);
        return expect(atom.keymaps.findKeyBindings({keystrokes: 'ctrl-z', target: createTestElement('test-2')})).toHaveLength(0);
      });
    });

    it("removes the package's stylesheets", function() {
      waitsForPromise(() => atom.packages.activatePackage('package-with-styles'));

      return runs(function() {
        atom.packages.deactivatePackage('package-with-styles');
        const one = require.resolve("./fixtures/packages/package-with-style-sheets-manifest/styles/1.css");
        const two = require.resolve("./fixtures/packages/package-with-style-sheets-manifest/styles/2.less");
        const three = require.resolve("./fixtures/packages/package-with-style-sheets-manifest/styles/3.css");
        expect(atom.themes.stylesheetElementForId(one)).not.toExist();
        expect(atom.themes.stylesheetElementForId(two)).not.toExist();
        return expect(atom.themes.stylesheetElementForId(three)).not.toExist();
      });
    });

    it("removes the package's scoped-properties", function() {
      waitsForPromise(() => atom.packages.activatePackage("package-with-settings"));

      return runs(function() {
        expect(atom.config.get('editor.increaseIndentPattern', {scope: ['.source.omg']})).toBe('^a');
        atom.packages.deactivatePackage("package-with-settings");
        return expect(atom.config.get('editor.increaseIndentPattern', {scope: ['.source.omg']})).toBeUndefined();
      });
    });

    return it("invokes ::onDidDeactivatePackage listeners with the deactivated package", function() {
      waitsForPromise(() => atom.packages.activatePackage("package-with-main"));

      return runs(function() {
        let deactivatedPackage = null;
        atom.packages.onDidDeactivatePackage(pack => deactivatedPackage = pack);
        atom.packages.deactivatePackage("package-with-main");
        return expect(deactivatedPackage.name).toBe("package-with-main");
      });
    });
  });

  describe("::activate()", function() {
    beforeEach(function() {
      spyOn(atom, 'inSpecMode').andReturn(false);
      jasmine.snapshotDeprecations();
      spyOn(console, 'warn');
      atom.packages.loadPackages();

      const loadedPackages = atom.packages.getLoadedPackages();
      return expect(loadedPackages.length).toBeGreaterThan(0);
    });

    afterEach(function() {
      atom.packages.deactivatePackages();
      atom.packages.unloadPackages();

      return jasmine.restoreDeprecationsSnapshot();
    });

    it("sets hasActivatedInitialPackages", function() {
      spyOn(atom.styles, 'getUserStyleSheetPath').andReturn(null);
      spyOn(atom.packages, 'activatePackages');
      expect(atom.packages.hasActivatedInitialPackages()).toBe(false);
      waitsForPromise(() => atom.packages.activate());
      return runs(() => expect(atom.packages.hasActivatedInitialPackages()).toBe(true));
    });

    it("activates all the packages, and none of the themes", function() {
      const packageActivator = spyOn(atom.packages, 'activatePackages');
      const themeActivator = spyOn(atom.themes, 'activatePackages');

      atom.packages.activate();

      expect(packageActivator).toHaveBeenCalled();
      expect(themeActivator).toHaveBeenCalled();

      const packages = packageActivator.mostRecentCall.args[0];
      for (let pack of Array.from(packages)) { expect(['atom', 'textmate']).toContain(pack.getType()); }

      const themes = themeActivator.mostRecentCall.args[0];
      return Array.from(themes).map((theme) => expect(['theme']).toContain(theme.getType()));
    });

    return it("calls callbacks registered with ::onDidActivateInitialPackages", function() {
      const package1 = atom.packages.loadPackage('package-with-main');
      const package2 = atom.packages.loadPackage('package-with-index');
      const package3 = atom.packages.loadPackage('package-with-activation-commands');
      spyOn(atom.packages, 'getLoadedPackages').andReturn([package1, package2, package3]);
      spyOn(atom.themes, 'activatePackages');
      const activateSpy = jasmine.createSpy('activateSpy');
      atom.packages.onDidActivateInitialPackages(activateSpy);

      atom.packages.activate();
      waitsFor(() => activateSpy.callCount > 0);
      return runs(function() {
        let needle, needle1, needle2;
        jasmine.unspy(atom.packages, 'getLoadedPackages');
        expect((needle = package1, Array.from(atom.packages.getActivePackages()).includes(needle))).toBe(true);
        expect((needle1 = package2, Array.from(atom.packages.getActivePackages()).includes(needle1))).toBe(true);
        return expect((needle2 = package3, Array.from(atom.packages.getActivePackages()).includes(needle2))).toBe(false);
      });
    });
  });

  return describe("::enablePackage(id) and ::disablePackage(id)", function() {
    describe("with packages", function() {
      it("enables a disabled package", function() {
        const packageName = 'package-with-main';
        atom.config.pushAtKeyPath('core.disabledPackages', packageName);
        atom.packages.observeDisabledPackages();
        expect(atom.config.get('core.disabledPackages')).toContain(packageName);

        const pack = atom.packages.enablePackage(packageName);
        const loadedPackages = atom.packages.getLoadedPackages();
        let activatedPackages = null;
        waitsFor(function() {
          activatedPackages = atom.packages.getActivePackages();
          return activatedPackages.length > 0;
        });

        return runs(function() {
          expect(loadedPackages).toContain(pack);
          expect(activatedPackages).toContain(pack);
          return expect(atom.config.get('core.disabledPackages')).not.toContain(packageName);
        });
      });

      it("disables an enabled package", function() {
        const packageName = 'package-with-main';
        waitsForPromise(() => atom.packages.activatePackage(packageName));

        return runs(function() {
          atom.packages.observeDisabledPackages();
          expect(atom.config.get('core.disabledPackages')).not.toContain(packageName);

          const pack = atom.packages.disablePackage(packageName);

          const activatedPackages = atom.packages.getActivePackages();
          expect(activatedPackages).not.toContain(pack);
          return expect(atom.config.get('core.disabledPackages')).toContain(packageName);
        });
      });

      it("returns null if the package cannot be loaded", function() {
        spyOn(console, 'warn');
        expect(atom.packages.enablePackage("this-doesnt-exist")).toBeNull();
        return expect(console.warn.callCount).toBe(1);
      });

      return it("does not disable an already disabled package", function() {
        const packageName = 'package-with-main';
        atom.config.pushAtKeyPath('core.disabledPackages', packageName);
        atom.packages.observeDisabledPackages();
        expect(atom.config.get('core.disabledPackages')).toContain(packageName);

        atom.packages.disablePackage(packageName);
        const packagesDisabled = atom.config.get('core.disabledPackages').filter(pack => pack === packageName);
        return expect(packagesDisabled.length).toEqual(1);
      });
    });

    return describe("with themes", function() {
      let didChangeActiveThemesHandler = null;

      beforeEach(() =>
        waitsForPromise(() => atom.themes.activateThemes())
      );

      afterEach(() => atom.themes.deactivateThemes());

      return it("enables and disables a theme", function() {
        const packageName = 'theme-with-package-file';

        expect(atom.config.get('core.themes')).not.toContain(packageName);
        expect(atom.config.get('core.disabledPackages')).not.toContain(packageName);

        // enabling of theme
        let pack = atom.packages.enablePackage(packageName);

        waitsFor('theme to enable', 500, function() {
          let needle;
          return (needle = pack, Array.from(atom.packages.getActivePackages()).includes(needle));
        });

        runs(function() {
          expect(atom.config.get('core.themes')).toContain(packageName);
          expect(atom.config.get('core.disabledPackages')).not.toContain(packageName);

          didChangeActiveThemesHandler = jasmine.createSpy('didChangeActiveThemesHandler');
          didChangeActiveThemesHandler.reset();
          atom.themes.onDidChangeActiveThemes(didChangeActiveThemesHandler);

          return pack = atom.packages.disablePackage(packageName);
        });

        waitsFor('did-change-active-themes event to fire', 500, () => didChangeActiveThemesHandler.callCount === 1);

        return runs(function() {
          expect(atom.packages.getActivePackages()).not.toContain(pack);
          expect(atom.config.get('core.themes')).not.toContain(packageName);
          expect(atom.config.get('core.themes')).not.toContain(packageName);
          return expect(atom.config.get('core.disabledPackages')).not.toContain(packageName);
        });
      });
    });
  });
});
