/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let AtomApplication;
const AtomWindow = require('./atom-window');
const ApplicationMenu = require('./application-menu');
const AtomProtocolHandler = require('./atom-protocol-handler');
const AutoUpdateManager = require('./auto-update-manager');
const StorageFolder = require('../storage-folder');
const Config = require('../config');
const FileRecoveryService = require('./file-recovery-service');
const ipcHelpers = require('../ipc-helpers');
const {BrowserWindow, Menu, app, dialog, ipcMain, shell, screen} = require('electron');
const {CompositeDisposable, Disposable} = require('event-kit');
const fs = require('fs-plus');
const path = require('path');
const os = require('os');
const net = require('net');
const url = require('url');
const {EventEmitter} = require('events');
const _ = require('underscore-plus');
let FindParentDir = null;
let Resolve = null;
const ConfigSchema = require('../config-schema');

const LocationSuffixRegExp = /(:\d+)(:\d+)?$/;

// The application's singleton class.
//
// It's the entry point into the Atom application and maintains the global state
// of the application.
//
module.exports =
(AtomApplication = (function() {
  AtomApplication = class AtomApplication {
    static initClass() {
      Object.assign(this.prototype, EventEmitter.prototype);
  
      this.prototype.windows = null;
      this.prototype.applicationMenu = null;
      this.prototype.atomProtocolHandler = null;
      this.prototype.resourcePath = null;
      this.prototype.version = null;
      this.prototype.quitting = false;
    }

    // Public: The entry point into the Atom application.
    static open(options) {
      if (options.socketPath == null) {
        if (process.platform === 'win32') {
          const userNameSafe = new Buffer(process.env.USERNAME).toString('base64');
          options.socketPath = `\\\\.\\pipe\\atom-${options.version}-${userNameSafe}-${process.arch}-sock`;
        } else {
          options.socketPath = path.join(os.tmpdir(), `atom-${options.version}-${process.env.USER}.sock`);
        }
      }

      // FIXME: Sometimes when socketPath doesn't exist, net.connect would strangely
      // take a few seconds to trigger 'error' event, it could be a bug of node
      // or atom-shell, before it's fixed we check the existence of socketPath to
      // speedup startup.
      if (((process.platform !== 'win32') && !fs.existsSync(options.socketPath)) || options.test || options.benchmark || options.benchmarkTest) {
        new AtomApplication(options).initialize(options);
        return;
      }

      var client = net.connect({path: options.socketPath}, () =>
        client.write(JSON.stringify(options), function() {
          client.end();
          return app.quit();
        })
      );

      return client.on('error', () => new AtomApplication(options).initialize(options));
    }

    exit(status) { return app.exit(status); }

    constructor(options) {
      ({resourcePath: this.resourcePath, devResourcePath: this.devResourcePath, version: this.version, devMode: this.devMode, safeMode: this.safeMode, socketPath: this.socketPath, logFile: this.logFile, userDataDir: this.userDataDir} = options);
      if (options.test || options.benchmark || options.benchmarkTest) { this.socketPath = null; }
      this.pidsToOpenWindows = {};
      this.windows = [];

      this.config = new Config({enablePersistence: true});
      this.config.setSchema(null, {type: 'object', properties: _.clone(ConfigSchema)});
      ConfigSchema.projectHome = {
        type: 'string',
        default: path.join(fs.getHomeDirectory(), 'github'),
        description: 'The directory where projects are assumed to be located. Packages created using the Package Generator will be stored here by default.'
      };
      this.config.initialize({configDirPath: process.env.ATOM_HOME, resourcePath: this.resourcePath, projectHomeSchema: ConfigSchema.projectHome});
      this.config.load();
      this.fileRecoveryService = new FileRecoveryService(path.join(process.env.ATOM_HOME, "recovery"));
      this.storageFolder = new StorageFolder(process.env.ATOM_HOME);
      this.autoUpdateManager = new AutoUpdateManager(
        this.version,
        options.test || options.benchmark || options.benchmarkTest,
        this.config
      );

      this.disposable = new CompositeDisposable;
      this.handleEvents();
    }

    // This stuff was previously done in the constructor, but we want to be able to construct this object
    // for testing purposes without booting up the world. As you add tests, feel free to move instantiation
    // of these various sub-objects into the constructor, but you'll need to remove the side-effects they
    // perform during their construction, adding an initialize method that you call here.
    initialize(options) {
      global.atomApplication = this;

      // DEPRECATED: This can be removed at some point (added in 1.13)
      // It converts `useCustomTitleBar: true` to `titleBar: "custom"`
      if ((process.platform === 'darwin') && this.config.get('core.useCustomTitleBar')) {
        this.config.unset('core.useCustomTitleBar');
        this.config.set('core.titleBar', 'custom');
      }

      this.config.onDidChange('core.titleBar', this.promptForRestart.bind(this));

      process.nextTick(() => this.autoUpdateManager.initialize());
      this.applicationMenu = new ApplicationMenu(this.version, this.autoUpdateManager);
      this.atomProtocolHandler = new AtomProtocolHandler(this.resourcePath, this.safeMode);

      this.listenForArgumentsFromNewProcess();
      this.setupDockMenu();

      return this.launch(options);
    }

    destroy() {
      const windowsClosePromises = this.windows.map(function(window) {
        window.close();
        return window.closedPromise;
      });
      return Promise.all(windowsClosePromises).then(() => this.disposable.dispose());
    }

    launch(options) {
      if (options.test || options.benchmark || options.benchmarkTest) {
        return this.openWithOptions(options);
      } else if (((options.pathsToOpen != null ? options.pathsToOpen.length : undefined) > 0) || ((options.urlsToOpen != null ? options.urlsToOpen.length : undefined) > 0)) {
        if (this.config.get('core.restorePreviousWindowsOnStart') === 'always') {
          this.loadState(_.deepClone(options));
        }
        return this.openWithOptions(options);
      } else {
        return this.loadState(options) || this.openPath(options);
      }
    }

    openWithOptions(options) {
      const {
        initialPaths, pathsToOpen, executedFrom, urlsToOpen, benchmark,
        benchmarkTest, test, pidToKillWhenClosed, devMode, safeMode, newWindow,
        logFile, profileStartup, timeout, clearWindowState, addToLastWindow, env
      } = options;

      app.focus();

      if (test) {
        return this.runTests({
          headless: true, devMode, resourcePath: this.resourcePath, executedFrom, pathsToOpen,
          logFile, timeout, env
        });
      } else if (benchmark || benchmarkTest) {
        return this.runBenchmarks({headless: true, test: benchmarkTest, resourcePath: this.resourcePath, executedFrom, pathsToOpen, timeout, env});
      } else if (pathsToOpen.length > 0) {
        return this.openPaths({
          initialPaths, pathsToOpen, executedFrom, pidToKillWhenClosed, newWindow,
          devMode, safeMode, profileStartup, clearWindowState, addToLastWindow, env
        });
      } else if (urlsToOpen.length > 0) {
        return Array.from(urlsToOpen).map((urlToOpen) =>
          this.openUrl({urlToOpen, devMode, safeMode, env}));
      } else {
        // Always open a editor window if this is the first instance of Atom.
        return this.openPath({
          initialPaths, pidToKillWhenClosed, newWindow, devMode, safeMode, profileStartup,
          clearWindowState, addToLastWindow, env
        });
      }
    }

    // Public: Removes the {AtomWindow} from the global window list.
    removeWindow(window) {
      this.windows.splice(this.windows.indexOf(window), 1);
      if (this.windows.length === 0) {
        if (this.applicationMenu != null) {
          this.applicationMenu.enableWindowSpecificItems(false);
        }
        if (['win32', 'linux'].includes(process.platform)) {
          app.quit();
          return;
        }
      }
      if (!window.isSpec) { return this.saveState(true); }
    }

    // Public: Adds the {AtomWindow} to the global window list.
    addWindow(window) {
      this.windows.push(window);
      if (this.applicationMenu != null) {
        this.applicationMenu.addWindow(window.browserWindow);
      }
      window.once('window:loaded', () => {
        return (this.autoUpdateManager != null ? this.autoUpdateManager.emitUpdateAvailableEvent(window) : undefined);
      });

      if (!window.isSpec) {
        const focusHandler = () => { return this.lastFocusedWindow = window; };
        const blurHandler = () => this.saveState(false);
        window.browserWindow.on('focus', focusHandler);
        window.browserWindow.on('blur', blurHandler);
        window.browserWindow.once('closed', () => {
          if (window === this.lastFocusedWindow) { this.lastFocusedWindow = null; }
          window.browserWindow.removeListener('focus', focusHandler);
          return window.browserWindow.removeListener('blur', blurHandler);
        });
        return window.browserWindow.webContents.once('did-finish-load', () => this.saveState(false));
      }
    }

    // Creates server to listen for additional atom application launches.
    //
    // You can run the atom command multiple times, but after the first launch
    // the other launches will just pass their information to this server and then
    // close immediately.
    listenForArgumentsFromNewProcess() {
      if (this.socketPath == null) { return; }
      this.deleteSocketFile();
      const server = net.createServer(connection => {
        let data = '';
        connection.on('data', chunk => data = data + chunk);

        return connection.on('end', () => {
          const options = JSON.parse(data);
          return this.openWithOptions(options);
        });
      });

      server.listen(this.socketPath);
      return server.on('error', error => console.error('Application server failed', error));
    }

    deleteSocketFile() {
      if ((process.platform === 'win32') || (this.socketPath == null)) { return; }

      if (fs.existsSync(this.socketPath)) {
        try {
          return fs.unlinkSync(this.socketPath);
        } catch (error) {
          // Ignore ENOENT errors in case the file was deleted between the exists
          // check and the call to unlink sync. This occurred occasionally on CI
          // which is why this check is here.
          if (error.code !== 'ENOENT') { throw error; }
        }
      }
    }

    // Registers basic application commands, non-idempotent.
    handleEvents() {
      const getLoadSettings = () => {
        return {
          devMode: __guard__(this.focusedWindow(), x => x.devMode),
          safeMode: __guard__(this.focusedWindow(), x1 => x1.safeMode)
        };
      };

      this.on('application:quit', () => app.quit());
      this.on('application:new-window', function() { return this.openPath(getLoadSettings()); });
      this.on('application:new-file', function() { let left;
      return ((left = this.focusedWindow()) != null ? left : this).openPath(); });
      this.on('application:open-dev', function() { return this.promptForPathToOpen('all', {devMode: true}); });
      this.on('application:open-safe', function() { return this.promptForPathToOpen('all', {safeMode: true}); });
      this.on('application:inspect', function({x, y, atomWindow}) {
        if (atomWindow == null) { atomWindow = this.focusedWindow(); }
        return (atomWindow != null ? atomWindow.browserWindow.inspectElement(x, y) : undefined);
      });

      this.on('application:open-documentation', () => shell.openExternal('http://flight-manual.atom.io/'));
      this.on('application:open-discussions', () => shell.openExternal('https://discuss.atom.io'));
      this.on('application:open-faq', () => shell.openExternal('https://atom.io/faq'));
      this.on('application:open-terms-of-use', () => shell.openExternal('https://atom.io/terms'));
      this.on('application:report-issue', () => shell.openExternal('https://github.com/atom/atom/blob/master/CONTRIBUTING.md#reporting-bugs'));
      this.on('application:search-issues', () => shell.openExternal('https://github.com/search?q=+is%3Aissue+user%3Aatom'));

      this.on('application:install-update', () => {
        this.quitting = true;
        return this.autoUpdateManager.install();
      });

      this.on('application:check-for-update', () => this.autoUpdateManager.check());

      if (process.platform === 'darwin') {
        this.on('application:bring-all-windows-to-front', () => Menu.sendActionToFirstResponder('arrangeInFront:'));
        this.on('application:hide', () => Menu.sendActionToFirstResponder('hide:'));
        this.on('application:hide-other-applications', () => Menu.sendActionToFirstResponder('hideOtherApplications:'));
        this.on('application:minimize', () => Menu.sendActionToFirstResponder('performMiniaturize:'));
        this.on('application:unhide-all-applications', () => Menu.sendActionToFirstResponder('unhideAllApplications:'));
        this.on('application:zoom', () => Menu.sendActionToFirstResponder('zoom:'));
      } else {
        this.on('application:minimize', function() { return __guard__(this.focusedWindow(), x => x.minimize()); });
        this.on('application:zoom', function() { return __guard__(this.focusedWindow(), x => x.maximize()); });
      }

      this.openPathOnEvent('application:about', 'atom://about');
      this.openPathOnEvent('application:show-settings', 'atom://config');
      this.openPathOnEvent('application:open-your-config', 'atom://.atom/config');
      this.openPathOnEvent('application:open-your-init-script', 'atom://.atom/init-script');
      this.openPathOnEvent('application:open-your-keymap', 'atom://.atom/keymap');
      this.openPathOnEvent('application:open-your-snippets', 'atom://.atom/snippets');
      this.openPathOnEvent('application:open-your-stylesheet', 'atom://.atom/stylesheet');
      this.openPathOnEvent('application:open-license', path.join(process.resourcesPath, 'LICENSE.md'));

      this.disposable.add(ipcHelpers.on(app, 'before-quit', event => {
        let resolveBeforeQuitPromise = null;
        this.lastBeforeQuitPromise = new Promise(function(resolve) { return resolveBeforeQuitPromise = resolve; });
        if (this.quitting) {
          return resolveBeforeQuitPromise();
        } else {
          event.preventDefault();
          this.quitting = true;
          const windowUnloadPromises = this.windows.map(window => window.prepareToUnload());
          return Promise.all(windowUnloadPromises).then(function(windowUnloadedResults) {
            const didUnloadAllWindows = windowUnloadedResults.every(didUnloadWindow => didUnloadWindow);
            if (didUnloadAllWindows) { app.quit(); }
            return resolveBeforeQuitPromise();
          });
        }
      })
      );

      this.disposable.add(ipcHelpers.on(app, 'will-quit', () => {
        this.killAllProcesses();
        return this.deleteSocketFile();
      })
      );

      this.disposable.add(ipcHelpers.on(app, 'open-file', (event, pathToOpen) => {
        event.preventDefault();
        return this.openPath({pathToOpen});
      })
      );

      this.disposable.add(ipcHelpers.on(app, 'open-url', (event, urlToOpen) => {
        event.preventDefault();
        return this.openUrl({urlToOpen, devMode: this.devMode, safeMode: this.safeMode});
      })
      );

      this.disposable.add(ipcHelpers.on(app, 'activate', (event, hasVisibleWindows) => {
        if (!hasVisibleWindows) {
          if (event != null) {
            event.preventDefault();
          }
          return this.emit('application:new-window');
        }
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'restart-application', () => {
        return this.restart();
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'resolve-proxy', (event, requestId, url) =>
        event.sender.session.resolveProxy(url, function(proxy) {
          if (!event.sender.isDestroyed()) {
            return event.sender.send('did-resolve-proxy', requestId, proxy);
          }
        })
      )
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'did-change-history-manager', event => {
        return (() => {
          const result = [];
          for (let atomWindow of Array.from(this.windows)) {
            const { webContents } = atomWindow.browserWindow;
            if (webContents !== event.sender) {
              result.push(webContents.send('did-change-history-manager'));
            } else {
              result.push(undefined);
            }
          }
          return result;
        })();
      })
      );

      // A request from the associated render process to open a new render process.
      this.disposable.add(ipcHelpers.on(ipcMain, 'open', (event, options) => {
        const window = this.atomWindowForEvent(event);
        if (options != null) {
          if (typeof options.pathsToOpen === 'string') {
            options.pathsToOpen = [options.pathsToOpen];
          }
          if ((options.pathsToOpen != null ? options.pathsToOpen.length : undefined) > 0) {
            options.window = window;
            return this.openPaths(options);
          } else {
            return new AtomWindow(this, this.fileRecoveryService, options);
          }
        } else {
          return this.promptForPathToOpen('all', {window});
        }
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'update-application-menu', (event, template, keystrokesByCommand) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return (this.applicationMenu != null ? this.applicationMenu.update(win, template, keystrokesByCommand) : undefined);
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'run-package-specs', (event, packageSpecPath) => {
        return this.runTests({resourcePath: this.devResourcePath, pathsToOpen: [packageSpecPath], headless: false});
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'run-benchmarks', (event, benchmarksPath) => {
        return this.runBenchmarks({resourcePath: this.devResourcePath, pathsToOpen: [benchmarksPath], headless: false, test: false});
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'command', (event, command) => {
        return this.emit(command);
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'open-command', (event, command, ...args) => {
        let defaultPath;
        if (args.length > 0) { defaultPath = args[0]; }
        switch (command) {
          case 'application:open': return this.promptForPathToOpen('all', getLoadSettings(), defaultPath);
          case 'application:open-file': return this.promptForPathToOpen('file', getLoadSettings(), defaultPath);
          case 'application:open-folder': return this.promptForPathToOpen('folder', getLoadSettings(), defaultPath);
          default: return console.log(`Invalid open-command received: ${command}`);
        }
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'window-command', function(event, command, ...args) {
        const win = BrowserWindow.fromWebContents(event.sender);
        return win.emit(command, ...Array.from(args));
      })
      );

      this.disposable.add(ipcHelpers.respondTo('window-method', (browserWindow, method, ...args) => {
        return __guard__(this.atomWindowForBrowserWindow(browserWindow), x => x[method](...Array.from(args || [])));
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'pick-folder', (event, responseChannel) => {
        return this.promptForPath("folder", selectedPaths => event.sender.send(responseChannel, selectedPaths));
      })
      );

      this.disposable.add(ipcHelpers.respondTo('set-window-size', (win, width, height) => win.setSize(width, height))
      );

      this.disposable.add(ipcHelpers.respondTo('set-window-position', (win, x, y) => win.setPosition(x, y))
      );

      this.disposable.add(ipcHelpers.respondTo('center-window', win => win.center())
      );

      this.disposable.add(ipcHelpers.respondTo('focus-window', win => win.focus())
      );

      this.disposable.add(ipcHelpers.respondTo('show-window', win => win.show())
      );

      this.disposable.add(ipcHelpers.respondTo('hide-window', win => win.hide())
      );

      this.disposable.add(ipcHelpers.respondTo('get-temporary-window-state', win => win.temporaryState)
      );

      this.disposable.add(ipcHelpers.respondTo('set-temporary-window-state', (win, state) => win.temporaryState = state)
      );

      const clipboard = require('../safe-clipboard');
      this.disposable.add(ipcHelpers.on(ipcMain, 'write-text-to-selection-clipboard', (event, selectedText) => clipboard.writeText(selectedText, 'selection'))
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'write-to-stdout', (event, output) => process.stdout.write(output))
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'write-to-stderr', (event, output) => process.stderr.write(output))
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'add-recent-document', (event, filename) => app.addRecentDocument(filename))
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'execute-javascript-in-dev-tools', (event, code) => event.sender.devToolsWebContents != null ? event.sender.devToolsWebContents.executeJavaScript(code) : undefined)
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'get-auto-update-manager-state', event => {
        return event.returnValue = this.autoUpdateManager.getState();
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'get-auto-update-manager-error', event => {
        return event.returnValue = this.autoUpdateManager.getErrorMessage();
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'will-save-path', (event, path) => {
        this.fileRecoveryService.willSavePath(this.atomWindowForEvent(event), path);
        return event.returnValue = true;
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'did-save-path', (event, path) => {
        this.fileRecoveryService.didSavePath(this.atomWindowForEvent(event), path);
        return event.returnValue = true;
      })
      );

      this.disposable.add(ipcHelpers.on(ipcMain, 'did-change-paths', () => {
        return this.saveState(false);
      })
      );

      return this.disposable.add(this.disableZoomOnDisplayChange());
    }

    setupDockMenu() {
      if (process.platform === 'darwin') {
        const dockMenu = Menu.buildFromTemplate([
          {label: 'New Window',  click: () => this.emit('application:new-window')}
        ]);
        return app.dock.setMenu(dockMenu);
      }
    }

    // Public: Executes the given command.
    //
    // If it isn't handled globally, delegate to the currently focused window.
    //
    // command - The string representing the command.
    // args - The optional arguments to pass along.
    sendCommand(command, ...args) {
      if (!this.emit(command, ...Array.from(args))) {
        const focusedWindow = this.focusedWindow();
        if (focusedWindow != null) {
          return focusedWindow.sendCommand(command, ...Array.from(args));
        } else {
          return this.sendCommandToFirstResponder(command);
        }
      }
    }

    // Public: Executes the given command on the given window.
    //
    // command - The string representing the command.
    // atomWindow - The {AtomWindow} to send the command to.
    // args - The optional arguments to pass along.
    sendCommandToWindow(command, atomWindow, ...args) {
      if (!this.emit(command, ...Array.from(args))) {
        if (atomWindow != null) {
          return atomWindow.sendCommand(command, ...Array.from(args));
        } else {
          return this.sendCommandToFirstResponder(command);
        }
      }
    }

    // Translates the command into macOS action and sends it to application's first
    // responder.
    sendCommandToFirstResponder(command) {
      if (process.platform !== 'darwin') { return false; }

      switch (command) {
        case 'core:undo': Menu.sendActionToFirstResponder('undo:'); break;
        case 'core:redo': Menu.sendActionToFirstResponder('redo:'); break;
        case 'core:copy': Menu.sendActionToFirstResponder('copy:'); break;
        case 'core:cut': Menu.sendActionToFirstResponder('cut:'); break;
        case 'core:paste': Menu.sendActionToFirstResponder('paste:'); break;
        case 'core:select-all': Menu.sendActionToFirstResponder('selectAll:'); break;
        default: return false;
      }
      return true;
    }

    // Public: Open the given path in the focused window when the event is
    // triggered.
    //
    // A new window will be created if there is no currently focused window.
    //
    // eventName - The event to listen for.
    // pathToOpen - The path to open when the event is triggered.
    openPathOnEvent(eventName, pathToOpen) {
      return this.on(eventName, function() {
        let window;
        if ((window = this.focusedWindow())) {
          return window.openPath(pathToOpen);
        } else {
          return this.openPath({pathToOpen});
        }
      });
    }

    // Returns the {AtomWindow} for the given paths.
    windowForPaths(pathsToOpen, devMode) {
      return _.find(this.windows, atomWindow => (atomWindow.devMode === devMode) && atomWindow.containsPaths(pathsToOpen));
    }

    // Returns the {AtomWindow} for the given ipcMain event.
    atomWindowForEvent({sender}) {
      return this.atomWindowForBrowserWindow(BrowserWindow.fromWebContents(sender));
    }

    atomWindowForBrowserWindow(browserWindow) {
      return this.windows.find(atomWindow => atomWindow.browserWindow === browserWindow);
    }

    // Public: Returns the currently focused {AtomWindow} or undefined if none.
    focusedWindow() {
      return _.find(this.windows, atomWindow => atomWindow.isFocused());
    }

    // Get the platform-specific window offset for new windows.
    getWindowOffsetForCurrentPlatform() {
      const offsetByPlatform = {
        darwin: 22,
        win32: 26
      };
      return offsetByPlatform[process.platform] != null ? offsetByPlatform[process.platform] : 0;
    }

    // Get the dimensions for opening a new window by cascading as appropriate to
    // the platform.
    getDimensionsForNewWindow() {
      let left, left1;
      if (__guard__(((left = this.focusedWindow()) != null ? left : this.lastFocusedWindow), x => x.isMaximized())) { return; }
      const dimensions = __guard__(((left1 = this.focusedWindow()) != null ? left1 : this.lastFocusedWindow), x1 => x1.getDimensions());
      const offset = this.getWindowOffsetForCurrentPlatform();
      if ((dimensions != null) && (offset != null)) {
        dimensions.x += offset;
        dimensions.y += offset;
      }
      return dimensions;
    }

    // Public: Opens a single path, in an existing window if possible.
    //
    // options -
    //   :pathToOpen - The file path to open
    //   :pidToKillWhenClosed - The integer of the pid to kill
    //   :newWindow - Boolean of whether this should be opened in a new window.
    //   :devMode - Boolean to control the opened window's dev mode.
    //   :safeMode - Boolean to control the opened window's safe mode.
    //   :profileStartup - Boolean to control creating a profile of the startup time.
    //   :window - {AtomWindow} to open file paths in.
    //   :addToLastWindow - Boolean of whether this should be opened in last focused window.
    openPath(param) {
      if (param == null) { param = {}; }
      const {initialPaths, pathToOpen, pidToKillWhenClosed, newWindow, devMode, safeMode, profileStartup, window, clearWindowState, addToLastWindow, env} = param;
      return this.openPaths({initialPaths, pathsToOpen: [pathToOpen], pidToKillWhenClosed, newWindow, devMode, safeMode, profileStartup, window, clearWindowState, addToLastWindow, env});
    }

    // Public: Opens multiple paths, in existing windows if possible.
    //
    // options -
    //   :pathsToOpen - The array of file paths to open
    //   :pidToKillWhenClosed - The integer of the pid to kill
    //   :newWindow - Boolean of whether this should be opened in a new window.
    //   :devMode - Boolean to control the opened window's dev mode.
    //   :safeMode - Boolean to control the opened window's safe mode.
    //   :windowDimensions - Object with height and width keys.
    //   :window - {AtomWindow} to open file paths in.
    //   :addToLastWindow - Boolean of whether this should be opened in last focused window.
    openPaths(param) {
      let existingWindow, openedWindow;
      let pathToOpen;
      if (param == null) { param = {}; }
      let {initialPaths, pathsToOpen, executedFrom, pidToKillWhenClosed, newWindow, devMode, safeMode, windowDimensions, profileStartup, window, clearWindowState, addToLastWindow, env} = param;
      if ((pathsToOpen == null) || (pathsToOpen.length === 0)) {
        return;
      }
      if (env == null) { ({ env } = process); }
      devMode = Boolean(devMode);
      safeMode = Boolean(safeMode);
      clearWindowState = Boolean(clearWindowState);
      const locationsToOpen = ((() => {
        const result = [];
        for (pathToOpen of Array.from(pathsToOpen)) {           result.push(this.locationForPathToOpen(pathToOpen, executedFrom, addToLastWindow));
        }
        return result;
      })());
      pathsToOpen = (Array.from(locationsToOpen).map((locationToOpen) => locationToOpen.pathToOpen));

      if (!pidToKillWhenClosed && !newWindow) {
        existingWindow = this.windowForPaths(pathsToOpen, devMode);
        const stats = ((() => {
          const result1 = [];
          for (pathToOpen of Array.from(pathsToOpen)) {             result1.push(fs.statSyncNoException(pathToOpen));
          }
          return result1;
        })());
        if (existingWindow == null) {
          let currentWindow;
          if (currentWindow = window != null ? window : this.lastFocusedWindow) {
            if (
              addToLastWindow ||
              ((currentWindow.devMode === devMode) &&
              (
                stats.every(stat => typeof stat.isFile === 'function' ? stat.isFile() : undefined) ||
                stats.some(stat => (typeof stat.isDirectory === 'function' ? stat.isDirectory() : undefined) && !currentWindow.hasProjectPath())
              ))
            ) { existingWindow = currentWindow; }
          }
        }
      }

      if (existingWindow != null) {
        openedWindow = existingWindow;
        openedWindow.openLocations(locationsToOpen);
        if (openedWindow.isMinimized()) {
          openedWindow.restore();
        } else {
          openedWindow.focus();
        }
        openedWindow.replaceEnvironment(env);
      } else {
        let resourcePath, windowInitializationScript;
        if (devMode) {
          try {
            windowInitializationScript = require.resolve(path.join(this.devResourcePath, 'src', 'initialize-application-window'));
            resourcePath = this.devResourcePath;
          } catch (error) {}
        }

        if (windowInitializationScript == null) { windowInitializationScript = require.resolve('../initialize-application-window'); }
        if (resourcePath == null) { ({ resourcePath } = this); }
        if (windowDimensions == null) { windowDimensions = this.getDimensionsForNewWindow(); }
        openedWindow = new AtomWindow(this, this.fileRecoveryService, {initialPaths, locationsToOpen, windowInitializationScript, resourcePath, devMode, safeMode, windowDimensions, profileStartup, clearWindowState, env});
        openedWindow.focus();
        this.lastFocusedWindow = openedWindow;
      }

      if (pidToKillWhenClosed != null) {
        this.pidsToOpenWindows[pidToKillWhenClosed] = openedWindow;
      }

      openedWindow.browserWindow.once('closed', () => {
        return this.killProcessForWindow(openedWindow);
      });

      return openedWindow;
    }

    // Kill all processes associated with opened windows.
    killAllProcesses() {
      for (let pid in this.pidsToOpenWindows) { this.killProcess(pid); }
    }

    // Kill process associated with the given opened window.
    killProcessForWindow(openedWindow) {
      for (let pid in this.pidsToOpenWindows) {
        const trackedWindow = this.pidsToOpenWindows[pid];
        if (trackedWindow === openedWindow) { this.killProcess(pid); }
      }
    }

    // Kill the process with the given pid.
    killProcess(pid) {
      try {
        const parsedPid = parseInt(pid);
        if (isFinite(parsedPid)) { process.kill(parsedPid); }
      } catch (error) {
        if (error.code !== 'ESRCH') {
          console.log(`Killing process ${pid} failed: ${error.code != null ? error.code : error.message}`);
        }
      }
      return delete this.pidsToOpenWindows[pid];
    }

    saveState(allowEmpty) {
      if (allowEmpty == null) { allowEmpty = false; }
      if (this.quitting) { return; }
      const states = [];
      for (let window of Array.from(this.windows)) {
        if (!window.isSpec) {
          states.push({initialPaths: window.representedDirectoryPaths});
        }
      }
      if ((states.length > 0) || allowEmpty) {
        this.storageFolder.storeSync('application.json', states);
        return this.emit('application:did-save-state');
      }
    }

    loadState(options) {
      let needle, states;
      if (((needle = this.config.get('core.restorePreviousWindowsOnStart'), ['yes', 'always'].includes(needle))) && (__guard__((states = this.storageFolder.load('application.json')), x => x.length) > 0)) {
        return Array.from(states).map((state) =>
          this.openWithOptions(Object.assign(options, {
            initialPaths: state.initialPaths,
            pathsToOpen: state.initialPaths.filter(directoryPath => fs.isDirectorySync(directoryPath)),
            urlsToOpen: [],
            devMode: this.devMode,
            safeMode: this.safeMode
          })));
      } else {
        return null;
      }
    }

    // Open an atom:// url.
    //
    // The host of the URL being opened is assumed to be the package name
    // responsible for opening the URL.  A new window will be created with
    // that package's `urlMain` as the bootstrap script.
    //
    // options -
    //   :urlToOpen - The atom:// url to open.
    //   :devMode - Boolean to control the opened window's dev mode.
    //   :safeMode - Boolean to control the opened window's safe mode.
    openUrl({urlToOpen, devMode, safeMode, env}) {
      if (this.packages == null) {
        const PackageManager = require('../package-manager');
        this.packages = new PackageManager({});
        this.packages.initialize({
          configDirPath: process.env.ATOM_HOME,
          devMode,
          resourcePath: this.resourcePath
        });
      }

      const packageName = url.parse(urlToOpen).host;
      const pack = _.find(this.packages.getAvailablePackageMetadata(), ({name}) => name === packageName);
      if (pack != null) {
        if (pack.urlMain) {
          const packagePath = this.packages.resolvePackagePath(packageName);
          const windowInitializationScript = path.resolve(packagePath, pack.urlMain);
          const windowDimensions = this.getDimensionsForNewWindow();
          return new AtomWindow(this, this.fileRecoveryService, {windowInitializationScript, resourcePath: this.resourcePath, devMode, safeMode, urlToOpen, windowDimensions, env});
        } else {
          return console.log(`Package '${pack.name}' does not have a url main: ${urlToOpen}`);
        }
      } else {
        return console.log(`Opening unknown url: ${urlToOpen}`);
      }
    }

    // Opens up a new {AtomWindow} to run specs within.
    //
    // options -
    //   :headless - A Boolean that, if true, will close the window upon
    //                   completion.
    //   :resourcePath - The path to include specs from.
    //   :specPath - The directory to load specs from.
    //   :safeMode - A Boolean that, if true, won't run specs from ~/.atom/packages
    //               and ~/.atom/dev/packages, defaults to false.
    runTests({headless, resourcePath, executedFrom, pathsToOpen, logFile, safeMode, timeout, env}) {
      let windowInitializationScript;
      if ((resourcePath !== this.resourcePath) && !fs.existsSync(resourcePath)) {
        ({ resourcePath } = this);
      }

      const timeoutInSeconds = Number.parseFloat(timeout);
      if (!Number.isNaN(timeoutInSeconds)) {
        const timeoutHandler = function() {
          console.log(`The test suite has timed out because it has been running for more than ${timeoutInSeconds} seconds.`);
          return process.exit(124); // Use the same exit code as the UNIX timeout util.
        };
        setTimeout(timeoutHandler, timeoutInSeconds * 1000);
      }

      try {
        windowInitializationScript = require.resolve(path.resolve(this.devResourcePath, 'src', 'initialize-test-window'));
      } catch (error) {
        windowInitializationScript = require.resolve(path.resolve(__dirname, '..', '..', 'src', 'initialize-test-window'));
      }

      const testPaths = [];
      if (pathsToOpen != null) {
        for (let pathToOpen of Array.from(pathsToOpen)) {
          testPaths.push(path.resolve(executedFrom, fs.normalize(pathToOpen)));
        }
      }

      if (testPaths.length === 0) {
        process.stderr.write('Error: Specify at least one test path\n\n');
        process.exit(1);
      }

      const legacyTestRunnerPath = this.resolveLegacyTestRunnerPath();
      const testRunnerPath = this.resolveTestRunnerPath(testPaths[0]);
      const devMode = true;
      const isSpec = true;
      if (safeMode == null) { safeMode = false; }
      return new AtomWindow(this, this.fileRecoveryService, {windowInitializationScript, resourcePath, headless, isSpec, devMode, testRunnerPath, legacyTestRunnerPath, testPaths, logFile, safeMode, env});
    }

    runBenchmarks({headless, test, resourcePath, executedFrom, pathsToOpen, env}) {
      let windowInitializationScript;
      if ((resourcePath !== this.resourcePath) && !fs.existsSync(resourcePath)) {
        ({ resourcePath } = this);
      }

      try {
        windowInitializationScript = require.resolve(path.resolve(this.devResourcePath, 'src', 'initialize-benchmark-window'));
      } catch (error) {
        windowInitializationScript = require.resolve(path.resolve(__dirname, '..', '..', 'src', 'initialize-benchmark-window'));
      }

      const benchmarkPaths = [];
      if (pathsToOpen != null) {
        for (let pathToOpen of Array.from(pathsToOpen)) {
          benchmarkPaths.push(path.resolve(executedFrom, fs.normalize(pathToOpen)));
        }
      }

      if (benchmarkPaths.length === 0) {
        process.stderr.write('Error: Specify at least one benchmark path.\n\n');
        process.exit(1);
      }

      const devMode = true;
      const isSpec = true;
      const safeMode = false;
      return new AtomWindow(this, this.fileRecoveryService, {windowInitializationScript, resourcePath, headless, test, isSpec, devMode, benchmarkPaths, safeMode, env});
    }

    resolveTestRunnerPath(testPath) {
      let packageRoot;
      if (FindParentDir == null) { FindParentDir = require('find-parent-dir'); }

      if (packageRoot = FindParentDir.sync(testPath, 'package.json')) {
        const packageMetadata = require(path.join(packageRoot, 'package.json'));
        if (packageMetadata.atomTestRunner) {
          let testRunnerPath;
          if (Resolve == null) { Resolve = require('resolve'); }
          if (testRunnerPath = Resolve.sync(packageMetadata.atomTestRunner, {basedir: packageRoot, extensions: Object.keys(require.extensions)})) {
            return testRunnerPath;
          } else {
            process.stderr.write(`Error: Could not resolve test runner path '${packageMetadata.atomTestRunner}'`);
            process.exit(1);
          }
        }
      }

      return this.resolveLegacyTestRunnerPath();
    }

    resolveLegacyTestRunnerPath() {
      try {
        return require.resolve(path.resolve(this.devResourcePath, 'spec', 'jasmine-test-runner'));
      } catch (error) {
        return require.resolve(path.resolve(__dirname, '..', '..', 'spec', 'jasmine-test-runner'));
      }
    }

    locationForPathToOpen(pathToOpen, executedFrom, forceAddToWindow) {
      let initialColumn, initialLine;
      if (executedFrom == null) { executedFrom = ''; }
      if (!pathToOpen) { return {pathToOpen}; }

      pathToOpen = pathToOpen.replace(/[:\s]+$/, '');
      const match = pathToOpen.match(LocationSuffixRegExp);

      if (match != null) {
        pathToOpen = pathToOpen.slice(0, -match[0].length);
        if (match[1]) { initialLine = Math.max(0, parseInt(match[1].slice(1)) - 1); }
        if (match[2]) { initialColumn = Math.max(0, parseInt(match[2].slice(1)) - 1); }
      } else {
        initialLine = (initialColumn = null);
      }

      if (url.parse(pathToOpen).protocol == null) {
        pathToOpen = path.resolve(executedFrom, fs.normalize(pathToOpen));
      }

      return {pathToOpen, initialLine, initialColumn, forceAddToWindow};
    }

    // Opens a native dialog to prompt the user for a path.
    //
    // Once paths are selected, they're opened in a new or existing {AtomWindow}s.
    //
    // options -
    //   :type - A String which specifies the type of the dialog, could be 'file',
    //           'folder' or 'all'. The 'all' is only available on macOS.
    //   :devMode - A Boolean which controls whether any newly opened windows
    //              should be in dev mode or not.
    //   :safeMode - A Boolean which controls whether any newly opened windows
    //               should be in safe mode or not.
    //   :window - An {AtomWindow} to use for opening a selected file path.
    //   :path - An optional String which controls the default path to which the
    //           file dialog opens.
    promptForPathToOpen(type, {devMode, safeMode, window}, path=null) {
      return this.promptForPath(type, (pathsToOpen => {
        return this.openPaths({pathsToOpen, devMode, safeMode, window});
      }), path);
    }

    promptForPath(type, callback, path) {
      const properties =
        (() => { switch (type) {
          case 'file': return ['openFile'];
          case 'folder': return ['openDirectory'];
          case 'all': return ['openFile', 'openDirectory'];
          default: throw new Error(`${type} is an invalid type for promptForPath`);
        } })();

      // Show the open dialog as child window on Windows and Linux, and as
      // independent dialog on macOS. This matches most native apps.
      const parentWindow =
        process.platform === 'darwin' ?
          null
        :
          BrowserWindow.getFocusedWindow();

      const openOptions = {
        properties: properties.concat(['multiSelections', 'createDirectory']),
        title: (() => { switch (type) {
          case 'file': return 'Open File';
          case 'folder': return 'Open Folder';
          default: return 'Open';
        } })()
      };

      // File dialog defaults to project directory of currently active editor
      if (path != null) {
        openOptions.defaultPath = path;
      }

      return dialog.showOpenDialog(parentWindow, openOptions, callback);
    }

    promptForRestart() {
      const chosen = dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'warning',
        title: 'Restart required',
        message: "You will need to restart Atom for this change to take effect.",
        buttons: ['Restart Atom', 'Cancel']
      });
      if (chosen === 0) {
        return this.restart();
      }
    }

    restart() {
      const args = [];
      if (this.safeMode) { args.push("--safe"); }
      if (this.logFile != null) { args.push(`--log-file=${this.logFile}`); }
      if (this.socketPath != null) { args.push(`--socket-path=${this.socketPath}`); }
      if (this.userDataDir != null) { args.push(`--user-data-dir=${this.userDataDir}`); }
      if (this.devMode) {
        args.push('--dev');
        args.push(`--resource-path=${this.resourcePath}`);
      }
      app.relaunch({args});
      return app.quit();
    }

    disableZoomOnDisplayChange() {
      const outerCallback = () => {
        return Array.from(this.windows).map((window) =>
          window.disableZoom());
      };

      // Set the limits every time a display is added or removed, otherwise the
      // configuration gets reset to the default, which allows zooming the
      // webframe.
      screen.on('display-added', outerCallback);
      screen.on('display-removed', outerCallback);
      return new Disposable(function() {
        screen.removeListener('display-added', outerCallback);
        return screen.removeListener('display-removed', outerCallback);
      });
    }
  };
  AtomApplication.initClass();
  return AtomApplication;
})());

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}