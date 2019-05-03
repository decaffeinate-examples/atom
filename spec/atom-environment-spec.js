/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require('underscore-plus');
const path = require('path');
const temp = require('temp').track();
const AtomEnvironment = require('../src/atom-environment');
const StorageFolder = require('../src/storage-folder');

describe("AtomEnvironment", function() {
  afterEach(() => temp.cleanupSync());

  describe('window sizing methods', function() {
    describe('::getPosition and ::setPosition', function() {
      let originalPosition = null;
      beforeEach(() => originalPosition = atom.getPosition());

      afterEach(() => atom.setPosition(originalPosition.x, originalPosition.y));

      return it('sets the position of the window, and can retrieve the position just set', function() {
        atom.setPosition(22, 45);
        return expect(atom.getPosition()).toEqual({x: 22, y: 45});
      });
    });

    return describe('::getSize and ::setSize', function() {
      let originalSize = null;
      beforeEach(() => originalSize = atom.getSize());
      afterEach(() => atom.setSize(originalSize.width, originalSize.height));

      return it('sets the size of the window, and can retrieve the size just set', function() {
        const newWidth = originalSize.width - 12;
        const newHeight = originalSize.height - 23;
        waitsForPromise(() => atom.setSize(newWidth, newHeight));
        return runs(() => expect(atom.getSize()).toEqual({width: newWidth, height: newHeight}));
      });
    });
  });

  describe(".isReleasedVersion()", () =>
    it("returns false if the version is a SHA and true otherwise", function() {
      let version = '0.1.0';
      spyOn(atom, 'getVersion').andCallFake(() => version);
      expect(atom.isReleasedVersion()).toBe(true);
      version = '36b5518';
      return expect(atom.isReleasedVersion()).toBe(false);
    })
  );

  describe("loading default config", () =>
    it('loads the default core config schema', function() {
      expect(atom.config.get('core.excludeVcsIgnoredPaths')).toBe(true);
      expect(atom.config.get('core.followSymlinks')).toBe(true);
      return expect(atom.config.get('editor.showInvisibles')).toBe(false);
    })
  );

  describe("window onerror handler", function() {
    let devToolsPromise = null;
    beforeEach(function() {
      devToolsPromise = Promise.resolve();
      spyOn(atom, 'openDevTools').andReturn(devToolsPromise);
      return spyOn(atom, 'executeJavaScriptInDevTools');
    });

    it("will open the dev tools when an error is triggered", function() {
      try {
        a + 1;
      } catch (e) {
        window.onerror.call(window, e.toString(), 'abc', 2, 3, e);
      }

      waitsForPromise(() => devToolsPromise);
      return runs(function() {
        expect(atom.openDevTools).toHaveBeenCalled();
        return expect(atom.executeJavaScriptInDevTools).toHaveBeenCalled();
      });
    });

    describe("::onWillThrowError", function() {
      let willThrowSpy = null;
      beforeEach(() => willThrowSpy = jasmine.createSpy());

      it("is called when there is an error", function() {
        let error = null;
        atom.onWillThrowError(willThrowSpy);
        try {
          a + 1;
        } catch (e) {
          error = e;
          window.onerror.call(window, e.toString(), 'abc', 2, 3, e);
        }

        delete willThrowSpy.mostRecentCall.args[0].preventDefault;
        return expect(willThrowSpy).toHaveBeenCalledWith({
          message: error.toString(),
          url: 'abc',
          line: 2,
          column: 3,
          originalError: error
        });
      });

      return it("will not show the devtools when preventDefault() is called", function() {
        willThrowSpy.andCallFake(errorObject => errorObject.preventDefault());
        atom.onWillThrowError(willThrowSpy);

        try {
          a + 1;
        } catch (e) {
          window.onerror.call(window, e.toString(), 'abc', 2, 3, e);
        }

        expect(willThrowSpy).toHaveBeenCalled();
        expect(atom.openDevTools).not.toHaveBeenCalled();
        return expect(atom.executeJavaScriptInDevTools).not.toHaveBeenCalled();
      });
    });

    return describe("::onDidThrowError", function() {
      let didThrowSpy = null;
      beforeEach(() => didThrowSpy = jasmine.createSpy());

      return it("is called when there is an error", function() {
        let error = null;
        atom.onDidThrowError(didThrowSpy);
        try {
          a + 1;
        } catch (e) {
          error = e;
          window.onerror.call(window, e.toString(), 'abc', 2, 3, e);
        }
        return expect(didThrowSpy).toHaveBeenCalledWith({
          message: error.toString(),
          url: 'abc',
          line: 2,
          column: 3,
          originalError: error
        });
      });
    });
  });

  describe(".assert(condition, message, callback)", function() {
    let errors = null;

    beforeEach(function() {
      errors = [];
      spyOn(atom, 'isReleasedVersion').andReturn(true);
      return atom.onDidFailAssertion(error => errors.push(error));
    });

    describe("if the condition is false", function() {
      it("notifies onDidFailAssertion handlers with an error object based on the call site of the assertion", function() {
        const result = atom.assert(false, "a == b");
        expect(result).toBe(false);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe("Assertion failed: a == b");
        return expect(errors[0].stack).toContain('atom-environment-spec');
      });

      describe("if passed a callback function", () =>
        it("calls the callback with the assertion failure's error object", function() {
          let error = null;
          atom.assert(false, "a == b", e => error = e);
          return expect(error).toBe(errors[0]);
      })
    );

      describe("if passed metadata", () =>
        it("assigns the metadata on the assertion failure's error object", function() {
          atom.assert(false, "a == b", {foo: 'bar'});
          return expect(errors[0].metadata).toEqual({foo: 'bar'});
      })
    );

      return describe("when Atom has been built from source", () =>
        it("throws an error", function() {
          atom.isReleasedVersion.andReturn(false);
          return expect(() => atom.assert(false, 'testing')).toThrow('Assertion failed: testing');
        })
      );
    });

    return describe("if the condition is true", () =>
      it("does nothing", function() {
        const result = atom.assert(true, "a == b");
        expect(result).toBe(true);
        return expect(errors).toEqual([]);
    })
  );
});

  describe("saving and loading", function() {
    beforeEach(() => atom.enablePersistence = true);

    afterEach(() => atom.enablePersistence = false);

    it("selects the state based on the current project paths", function() {
      jasmine.useRealClock();

      const [dir1, dir2] = Array.from([temp.mkdirSync("dir1-"), temp.mkdirSync("dir2-")]);

      const loadSettings = _.extend(atom.getLoadSettings(), {
        initialPaths: [dir1],
        windowState: null
      }
      );

      spyOn(atom, 'getLoadSettings').andCallFake(() => loadSettings);
      spyOn(atom, 'serialize').andReturn({stuff: 'cool'});

      atom.project.setPaths([dir1, dir2]);
      // State persistence will fail if other Atom instances are running
      waitsForPromise(() =>
        atom.stateStore.connect().then(isConnected => expect(isConnected).toBe(true))
      );

      waitsForPromise(() =>
        atom.saveState().then(() =>
          atom.loadState().then(state => expect(state).toBeFalsy())
        )
      );

      return waitsForPromise(function() {
        loadSettings.initialPaths = [dir2, dir1];
        return atom.loadState().then(state => expect(state).toEqual({stuff: 'cool'}));
      });
    });

    it("loads state from the storage folder when it can't be found in atom.stateStore", function() {
      jasmine.useRealClock();

      const storageFolderState = {foo: 1, bar: 2};
      const serializedState = {someState: 42};
      const loadSettings = _.extend(atom.getLoadSettings(), {initialPaths: [temp.mkdirSync("project-directory")]});
      spyOn(atom, 'getLoadSettings').andReturn(loadSettings);
      spyOn(atom, 'serialize').andReturn(serializedState);
      spyOn(atom, 'getStorageFolder').andReturn(new StorageFolder(temp.mkdirSync("config-directory")));
      atom.project.setPaths(atom.getLoadSettings().initialPaths);

      waitsForPromise(() => atom.stateStore.connect());

      runs(() => atom.getStorageFolder().storeSync(atom.getStateKey(loadSettings.initialPaths), storageFolderState));

      waitsForPromise(() => atom.loadState().then(state => expect(state).toEqual(storageFolderState)));

      waitsForPromise(() => atom.saveState());

      return waitsForPromise(() => atom.loadState().then(state => expect(state).toEqual(serializedState)));
    });

    it("saves state when the CPU is idle after a keydown or mousedown event", function() {
      const atomEnv = new AtomEnvironment({
        applicationDelegate: global.atom.applicationDelegate,
      });
      const idleCallbacks = [];
      atomEnv.initialize({
        window: {
          requestIdleCallback(callback) { return idleCallbacks.push(callback); },
          addEventListener() {},
          removeEventListener() {}
        },
        document: document.implementation.createHTMLDocument()
      });

      spyOn(atomEnv, 'saveState');

      const keydown = new KeyboardEvent('keydown');
      atomEnv.document.dispatchEvent(keydown);
      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState).toHaveBeenCalledWith({isUnloading: false});
      expect(atomEnv.saveState).not.toHaveBeenCalledWith({isUnloading: true});

      atomEnv.saveState.reset();
      const mousedown = new MouseEvent('mousedown');
      atomEnv.document.dispatchEvent(mousedown);
      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState).toHaveBeenCalledWith({isUnloading: false});
      expect(atomEnv.saveState).not.toHaveBeenCalledWith({isUnloading: true});

      return atomEnv.destroy();
    });

    it("ignores mousedown/keydown events happening after calling unloadEditorWindow", function() {
      const atomEnv = new AtomEnvironment({
        applicationDelegate: global.atom.applicationDelegate,
      });
      const idleCallbacks = [];
      atomEnv.initialize({
        window: {
          requestIdleCallback(callback) { return idleCallbacks.push(callback); },
          addEventListener() {},
          removeEventListener() {}
        },
        document: document.implementation.createHTMLDocument()
      });

      spyOn(atomEnv, 'saveState');

      let mousedown = new MouseEvent('mousedown');
      atomEnv.document.dispatchEvent(mousedown);
      atomEnv.unloadEditorWindow();
      expect(atomEnv.saveState).not.toHaveBeenCalled();

      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState).not.toHaveBeenCalled();

      mousedown = new MouseEvent('mousedown');
      atomEnv.document.dispatchEvent(mousedown);
      advanceClock(atomEnv.saveStateDebounceInterval);
      idleCallbacks.shift()();
      expect(atomEnv.saveState).not.toHaveBeenCalled();

      return atomEnv.destroy();
    });

    it("serializes the project state with all the options supplied in saveState", function() {
      spyOn(atom.project, 'serialize').andReturn({foo: 42});

      waitsForPromise(() => atom.saveState({anyOption: 'any option'}));
      return runs(function() {
        expect(atom.project.serialize.calls.length).toBe(1);
        return expect(atom.project.serialize.mostRecentCall.args[0]).toEqual({anyOption: 'any option'});
      });
    });

    return it("serializes the text editor registry", function() {
      let editor = null;

      waitsForPromise(() => atom.workspace.open('sample.js').then(e => editor = e));

      return waitsForPromise(function() {
        atom.textEditors.setGrammarOverride(editor, 'text.plain');

        const atom2 = new AtomEnvironment({
          applicationDelegate: atom.applicationDelegate,
          window: document.createElement('div'),
          document: Object.assign(
            document.createElement('div'),
            {
              body: document.createElement('div'),
              head: document.createElement('div'),
            }
          )
        });
        atom2.initialize({document, window});
        return atom2.deserialize(atom.serialize()).then(function() {
          expect(atom2.textEditors.getGrammarOverride(editor)).toBe('text.plain');
          return atom2.destroy();
        });
      });
    });
  });

  describe("openInitialEmptyEditorIfNecessary", function() {
    describe("when there are no paths set", function() {
      beforeEach(() => spyOn(atom, 'getLoadSettings').andReturn({initialPaths: []}));

      it("opens an empty buffer", function() {
        spyOn(atom.workspace, 'open');
        atom.openInitialEmptyEditorIfNecessary();
        return expect(atom.workspace.open).toHaveBeenCalledWith(null);
      });

      return describe("when there is already a buffer open", function() {
        beforeEach(() => waitsForPromise(() => atom.workspace.open()));

        return it("does not open an empty buffer", function() {
          spyOn(atom.workspace, 'open');
          atom.openInitialEmptyEditorIfNecessary();
          return expect(atom.workspace.open).not.toHaveBeenCalled();
        });
      });
    });

    return describe("when the project has a path", function() {
      beforeEach(function() {
        spyOn(atom, 'getLoadSettings').andReturn({initialPaths: ['something']});
        return spyOn(atom.workspace, 'open');
      });

      return it("does not open an empty buffer", function() {
        atom.openInitialEmptyEditorIfNecessary();
        return expect(atom.workspace.open).not.toHaveBeenCalled();
      });
    });
  });

  describe("adding a project folder", function() {
    it("does nothing if the user dismisses the file picker", function() {
      const initialPaths = atom.project.getPaths();
      const tempDirectory = temp.mkdirSync("a-new-directory");
      spyOn(atom, "pickFolder").andCallFake(callback => callback(null));
      atom.addProjectFolder();
      return expect(atom.project.getPaths()).toEqual(initialPaths);
    });

    describe("when there is no saved state for the added folders", function() {
      beforeEach(function() {
        spyOn(atom, 'loadState').andReturn(Promise.resolve(null));
        return spyOn(atom, 'attemptRestoreProjectStateForPaths');
      });

      return it("adds the selected folder to the project", function() {
        const initialPaths = atom.project.setPaths([]);
        const tempDirectory = temp.mkdirSync("a-new-directory");
        spyOn(atom, "pickFolder").andCallFake(callback => callback([tempDirectory]));
        waitsForPromise(() => atom.addProjectFolder());
        return runs(function() {
          expect(atom.project.getPaths()).toEqual([tempDirectory]);
          return expect(atom.attemptRestoreProjectStateForPaths).not.toHaveBeenCalled();
        });
      });
    });

    return describe("when there is saved state for the relevant directories", function() {
      const state = Symbol('savedState');

      beforeEach(function() {
        spyOn(atom, "getStateKey").andCallFake(dirs => dirs.join(':'));
        spyOn(atom, "loadState").andCallFake(function(key) {
          if (key === __dirname) { return Promise.resolve(state); } else { return Promise.resolve(null); }
        });
        spyOn(atom, "attemptRestoreProjectStateForPaths");
        spyOn(atom, "pickFolder").andCallFake(callback => callback([__dirname]));
        return atom.project.setPaths([]);
      });

      describe("when there are no project folders", () =>
        it("attempts to restore the project state", function() {
          waitsForPromise(() => atom.addProjectFolder());
          return runs(function() {
            expect(atom.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(state, [__dirname]);
            return expect(atom.project.getPaths()).toEqual([]);
          });
        })
      );

      return describe("when there are already project folders", function() {
        const openedPath = path.join(__dirname, 'fixtures');
        beforeEach(() => atom.project.setPaths([openedPath]));

        return it("does not attempt to restore the project state, instead adding the project paths", function() {
          waitsForPromise(() => atom.addProjectFolder());
          return runs(function() {
            expect(atom.attemptRestoreProjectStateForPaths).not.toHaveBeenCalled();
            return expect(atom.project.getPaths()).toEqual([openedPath, __dirname]);
          });
        });
      });
    });
  });

  describe("attemptRestoreProjectStateForPaths(state, projectPaths, filesToOpen)", function() {
    describe("when the window is clean (empty or has only unnamed, unmodified buffers)", function() {
      beforeEach(() =>
        // Unnamed, unmodified buffer doesn't count toward "clean"-ness
        waitsForPromise(() => atom.workspace.open())
      );

      it("automatically restores the saved state into the current environment", function() {
        const state = Symbol();
        spyOn(atom.workspace, 'open');
        spyOn(atom, 'restoreStateIntoThisEnvironment');

        atom.attemptRestoreProjectStateForPaths(state, [__dirname], [__filename]);
        expect(atom.restoreStateIntoThisEnvironment).toHaveBeenCalledWith(state);
        expect(atom.workspace.open.callCount).toBe(1);
        return expect(atom.workspace.open).toHaveBeenCalledWith(__filename);
      });

      return describe("when a dock has a non-text editor", () =>
        it("doesn't prompt the user to restore state", function() {
          const dock = atom.workspace.getLeftDock();
          dock.getActivePane().addItem({
            getTitle() { return 'title'; },
            element: document.createElement('div')
          });
          const state = Symbol();
          spyOn(atom, 'confirm');
          atom.attemptRestoreProjectStateForPaths(state, [__dirname], [__filename]);
          return expect(atom.confirm).not.toHaveBeenCalled();
        })
      );
    });

    return describe("when the window is dirty", function() {
      let editor = null;

      beforeEach(() =>
        waitsForPromise(() => atom.workspace.open().then(function(e) {
          editor = e;
          return editor.setText('new editor');
        })
         )
      );

      describe("when a dock has a modified editor", () =>
        it("prompts the user to restore the state", function() {
          const dock = atom.workspace.getLeftDock();
          dock.getActivePane().addItem(editor);
          spyOn(atom, "confirm").andReturn(1);
          spyOn(atom.project, 'addPath');
          spyOn(atom.workspace, 'open');
          const state = Symbol();
          atom.attemptRestoreProjectStateForPaths(state, [__dirname], [__filename]);
          return expect(atom.confirm).toHaveBeenCalled();
        })
      );

      it("prompts the user to restore the state in a new window, discarding it and adding folder to current window", function() {
        spyOn(atom, "confirm").andReturn(1);
        spyOn(atom.project, 'addPath');
        spyOn(atom.workspace, 'open');
        const state = Symbol();

        atom.attemptRestoreProjectStateForPaths(state, [__dirname], [__filename]);
        expect(atom.confirm).toHaveBeenCalled();
        expect(atom.project.addPath.callCount).toBe(1);
        expect(atom.project.addPath).toHaveBeenCalledWith(__dirname);
        expect(atom.workspace.open.callCount).toBe(1);
        return expect(atom.workspace.open).toHaveBeenCalledWith(__filename);
      });

      return it("prompts the user to restore the state in a new window, opening a new window", function() {
        spyOn(atom, "confirm").andReturn(0);
        spyOn(atom, "open");
        const state = Symbol();

        atom.attemptRestoreProjectStateForPaths(state, [__dirname], [__filename]);
        expect(atom.confirm).toHaveBeenCalled();
        return expect(atom.open).toHaveBeenCalledWith({
          pathsToOpen: [__dirname, __filename],
          newWindow: true,
          devMode: atom.inDevMode(),
          safeMode: atom.inSafeMode()
        });
      });
    });
  });

  describe("::unloadEditorWindow()", () =>
    it("saves the BlobStore so it can be loaded after reload", function() {
      const configDirPath = temp.mkdirSync('atom-spec-environment');
      const fakeBlobStore = jasmine.createSpyObj("blob store", ["save"]);
      const atomEnvironment = new AtomEnvironment({applicationDelegate: atom.applicationDelegate, enablePersistence: true});
      atomEnvironment.initialize({configDirPath, blobStore: fakeBlobStore, window, document});

      atomEnvironment.unloadEditorWindow();

      expect(fakeBlobStore.save).toHaveBeenCalled();

      return atomEnvironment.destroy();
    })
  );

  describe("::destroy()", () =>
    it("does not throw exceptions when unsubscribing from ipc events (regression)", function() {
      const configDirPath = temp.mkdirSync('atom-spec-environment');
      const fakeDocument = {
        addEventListener() {},
        removeEventListener() {},
        head: document.createElement('head'),
        body: document.createElement('body')
      };
      const atomEnvironment = new AtomEnvironment({applicationDelegate: atom.applicationDelegate});
      atomEnvironment.initialize({window, document: fakeDocument});
      spyOn(atomEnvironment.packages, 'loadPackages').andReturn(Promise.resolve());
      spyOn(atomEnvironment.packages, 'activate').andReturn(Promise.resolve());
      spyOn(atomEnvironment, 'displayWindow').andReturn(Promise.resolve());
      waitsForPromise(() => atomEnvironment.startEditorWindow());
      return runs(function() {
        atomEnvironment.unloadEditorWindow();
        return atomEnvironment.destroy();
      });
    })
  );

  describe("::whenShellEnvironmentLoaded()", function() {
    let [atomEnvironment, envLoaded, spy] = Array.from([]);

    beforeEach(function() {
      let resolve = null;
      const promise = new Promise(function(r) { return resolve = r; });
      envLoaded = function() {
        resolve();
        return waitsForPromise(() => promise);
      };
      atomEnvironment = new AtomEnvironment({
        applicationDelegate: atom.applicationDelegate,
        updateProcessEnv() { return promise; }
      });
      atomEnvironment.initialize({window, document});
      return spy = jasmine.createSpy();
    });

    afterEach(() => atomEnvironment.destroy());

    it("is triggered once the shell environment is loaded", function() {
      atomEnvironment.whenShellEnvironmentLoaded(spy);
      atomEnvironment.updateProcessEnvAndTriggerHooks();
      envLoaded();
      return runs(() => expect(spy).toHaveBeenCalled());
    });

    return it("triggers the callback immediately if the shell environment is already loaded", function() {
      atomEnvironment.updateProcessEnvAndTriggerHooks();
      envLoaded();
      return runs(function() {
        atomEnvironment.whenShellEnvironmentLoaded(spy);
        return expect(spy).toHaveBeenCalled();
      });
    });
  });

  describe("::openLocations(locations) (called via IPC from browser process)", function() {
    beforeEach(function() {
      spyOn(atom.workspace, 'open');
      return atom.project.setPaths([]);
    });

    describe("when there is no saved state", function() {
      beforeEach(() => spyOn(atom, "loadState").andReturn(Promise.resolve(null)));

      describe("when the opened path exists", function() {
        it("adds it to the project's paths", function() {
          const pathToOpen = __filename;
          waitsForPromise(() => atom.openLocations([{pathToOpen}]));
          return runs(() => expect(atom.project.getPaths()[0]).toBe(__dirname));
        });

        return describe("then a second path is opened with forceAddToWindow", () =>
          it("adds the second path to the project's paths", function() {
            const firstPathToOpen = __dirname;
            const secondPathToOpen = path.resolve(__dirname, './fixtures');
            waitsForPromise(() => atom.openLocations([{pathToOpen: firstPathToOpen}]));
            waitsForPromise(() => atom.openLocations([{pathToOpen: secondPathToOpen, forceAddToWindow: true}]));
            return runs(() => expect(atom.project.getPaths()).toEqual([firstPathToOpen, secondPathToOpen]));
          })
        );
      });

      describe("when the opened path does not exist but its parent directory does", () =>
        it("adds the parent directory to the project paths", function() {
          const pathToOpen = path.join(__dirname, 'this-path-does-not-exist.txt');
          waitsForPromise(() => atom.openLocations([{pathToOpen}]));
          return runs(() => expect(atom.project.getPaths()[0]).toBe(__dirname));
        })
      );

      describe("when the opened path is a file", () =>
        it("opens it in the workspace", function() {
          const pathToOpen = __filename;
          waitsForPromise(() => atom.openLocations([{pathToOpen}]));
          return runs(() => expect(atom.workspace.open.mostRecentCall.args[0]).toBe(__filename));
        })
      );

      describe("when the opened path is a directory", () =>
        it("does not open it in the workspace", function() {
          const pathToOpen = __dirname;
          waitsForPromise(() => atom.openLocations([{pathToOpen}]));
          return runs(() => expect(atom.workspace.open.callCount).toBe(0));
        })
      );

      return describe("when the opened path is a uri", () =>
        it("adds it to the project's paths as is", function() {
          const pathToOpen = 'remote://server:7644/some/dir/path';
          spyOn(atom.project, 'addPath');
          waitsForPromise(() => atom.openLocations([{pathToOpen}]));
          return runs(() => expect(atom.project.addPath).toHaveBeenCalledWith(pathToOpen));
        })
      );
    });

    return describe("when there is saved state for the relevant directories", function() {
      const state = Symbol('savedState');

      beforeEach(function() {
        spyOn(atom, "getStateKey").andCallFake(dirs => dirs.join(':'));
        spyOn(atom, "loadState").andCallFake(function(key) {
          if (key === __dirname) { return Promise.resolve(state); } else { return Promise.resolve(null); }
        });
        return spyOn(atom, "attemptRestoreProjectStateForPaths");
      });

      describe("when there are no project folders", function() {
        it("attempts to restore the project state", function() {
          const pathToOpen = __dirname;
          waitsForPromise(() => atom.openLocations([{pathToOpen}]));
          return runs(function() {
            expect(atom.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(state, [pathToOpen], []);
            return expect(atom.project.getPaths()).toEqual([]);
          });
        });

        return it("opens the specified files", function() {
          waitsForPromise(() => atom.openLocations([{pathToOpen: __dirname}, {pathToOpen: __filename}]));
          return runs(function() {
            expect(atom.attemptRestoreProjectStateForPaths).toHaveBeenCalledWith(state, [__dirname], [__filename]);
            return expect(atom.project.getPaths()).toEqual([]);
          });
        });
      });


      return describe("when there are already project folders", function() {
        beforeEach(() => atom.project.setPaths([__dirname]));

        it("does not attempt to restore the project state, instead adding the project paths", function() {
          const pathToOpen = path.join(__dirname, 'fixtures');
          waitsForPromise(() => atom.openLocations([{pathToOpen, forceAddToWindow: true}]));
          return runs(function() {
            expect(atom.attemptRestoreProjectStateForPaths).not.toHaveBeenCalled();
            return expect(atom.project.getPaths()).toEqual([__dirname, pathToOpen]);
          });
        });

        return it("opens the specified files", function() {
          const pathToOpen = path.join(__dirname, 'fixtures');
          const fileToOpen = path.join(pathToOpen, 'michelle-is-awesome.txt');
          waitsForPromise(() => atom.openLocations([{pathToOpen}, {pathToOpen: fileToOpen}]));
          return runs(function() {
            expect(atom.attemptRestoreProjectStateForPaths).not.toHaveBeenCalledWith(state, [pathToOpen], [fileToOpen]);
            return expect(atom.project.getPaths()).toEqual([__dirname]);
          });
        });
      });
    });
  });

  describe("::updateAvailable(info) (called via IPC from browser process)", function() {
    let subscription = null;

    afterEach(() => subscription != null ? subscription.dispose() : undefined);

    return it("invokes onUpdateAvailable listeners", function() {
      if (process.platform !== 'darwin') { return; } // Test tied to electron autoUpdater, we use something else on Linux and Win32

      atom.listenForUpdates();

      const updateAvailableHandler = jasmine.createSpy("update-available-handler");
      subscription = atom.onUpdateAvailable(updateAvailableHandler);

      const { autoUpdater } = require('electron').remote;
      autoUpdater.emit('update-downloaded', null, "notes", "version");

      waitsFor(() => updateAvailableHandler.callCount > 0);

      return runs(function() {
        const {releaseVersion} = updateAvailableHandler.mostRecentCall.args[0];
        return expect(releaseVersion).toBe('version');
      });
    });
  });

  return describe("::getReleaseChannel()", function() {
    let [version] = Array.from([]);
    beforeEach(() => spyOn(atom, 'getVersion').andCallFake(() => version));

    return it("returns the correct channel based on the version number", function() {
      version = '1.5.6';
      expect(atom.getReleaseChannel()).toBe('stable');

      version = '1.5.0-beta10';
      expect(atom.getReleaseChannel()).toBe('beta');

      version = '1.7.0-dev-5340c91';
      return expect(atom.getReleaseChannel()).toBe('dev');
    });
  });
});
