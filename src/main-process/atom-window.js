/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let AtomWindow;
const {BrowserWindow, app, dialog, ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const {EventEmitter} = require('events');

module.exports =
(AtomWindow = (function() {
  AtomWindow = class AtomWindow {
    static initClass() {
      Object.assign(this.prototype, EventEmitter.prototype);
  
      this.iconPath = path.resolve(__dirname, '..', '..', 'resources', 'atom.png');
      this.includeShellLoadTime = true;
  
      this.prototype.browserWindow = null;
      this.prototype.loaded = null;
      this.prototype.isSpec = null;
    }

    constructor(atomApplication, fileRecoveryService, settings) {
      let locationsToOpen;
      let pathToOpen;
      this.atomApplication = atomApplication;
      this.fileRecoveryService = fileRecoveryService;
      if (settings == null) { settings = {}; }
      ({resourcePath: this.resourcePath, pathToOpen, locationsToOpen, isSpec: this.isSpec, headless: this.headless, safeMode: this.safeMode, devMode: this.devMode} = settings);
      if (pathToOpen) { if (locationsToOpen == null) { locationsToOpen = [{pathToOpen}]; } }
      if (locationsToOpen == null) { locationsToOpen = []; }

      this.loadedPromise = new Promise(resolveLoadedPromise => {
        this.resolveLoadedPromise = resolveLoadedPromise;
        
    });
      this.closedPromise = new Promise(resolveClosedPromise => {
        this.resolveClosedPromise = resolveClosedPromise;
        
    });

      const options = {
        show: false,
        title: 'Atom',
        webPreferences: {
          // Prevent specs from throttling when the window is in the background:
          // this should result in faster CI builds, and an improvement in the
          // local development experience when running specs through the UI (which
          // now won't pause when e.g. minimizing the window).
          backgroundThrottling: !this.isSpec,
          // Disable the `auxclick` feature so that `click` events are triggered in
          // response to a middle-click.
          // (Ref: https://github.com/atom/atom/pull/12696#issuecomment-290496960)
          disableBlinkFeatures: 'Auxclick'
        }
      };

      // Don't set icon on Windows so the exe's ico will be used as window and
      // taskbar's icon. See https://github.com/atom/atom/issues/4811 for more.
      if (process.platform === 'linux') {
        options.icon = this.constructor.iconPath;
      }

      if (this.shouldAddCustomTitleBar()) {
        options.titleBarStyle = 'hidden';
      }

      if (this.shouldAddCustomInsetTitleBar()) {
        options.titleBarStyle = 'hidden-inset';
      }

      if (this.shouldHideTitleBar()) {
        options.frame = false;
      }

      this.browserWindow = new BrowserWindow(options);
      this.handleEvents();

      this.loadSettings = Object.assign({}, settings);
      this.loadSettings.appVersion = app.getVersion();
      this.loadSettings.resourcePath = this.resourcePath;
      if (this.loadSettings.devMode == null) { this.loadSettings.devMode = false; }
      if (this.loadSettings.safeMode == null) { this.loadSettings.safeMode = false; }
      this.loadSettings.atomHome = process.env.ATOM_HOME;
      if (this.loadSettings.clearWindowState == null) { this.loadSettings.clearWindowState = false; }
      if (this.loadSettings.initialPaths == null) { this.loadSettings.initialPaths =
        (() => {
        const result = [];
        for ({pathToOpen} of Array.from(locationsToOpen)) {
          if (pathToOpen) {
            const stat = fs.statSyncNoException(pathToOpen) || null;
            if (stat != null ? stat.isDirectory() : undefined) {
              result.push(pathToOpen);
            } else {
              const parentDirectory = path.dirname(pathToOpen);
              if ((stat != null ? stat.isFile() : undefined) || fs.existsSync(parentDirectory)) {
                result.push(parentDirectory);
              } else {
                result.push(pathToOpen);
              }
            }
          }
        }
        return result;
      })(); }
      this.loadSettings.initialPaths.sort();

      // Only send to the first non-spec window created
      if (this.constructor.includeShellLoadTime && !this.isSpec) {
        this.constructor.includeShellLoadTime = false;
        if (this.loadSettings.shellLoadTime == null) { this.loadSettings.shellLoadTime = Date.now() - global.shellStartTime; }
      }

      this.representedDirectoryPaths = this.loadSettings.initialPaths;
      if (this.loadSettings.env != null) { this.env = this.loadSettings.env; }

      this.browserWindow.loadSettingsJSON = JSON.stringify(this.loadSettings);

      this.browserWindow.on('window:loaded', () => {
        this.disableZoom();
        this.emit('window:loaded');
        return this.resolveLoadedPromise();
      });

      this.browserWindow.on('window:locations-opened', () => {
        return this.emit('window:locations-opened');
      });

      this.browserWindow.on('enter-full-screen', () => {
        return this.browserWindow.webContents.send('did-enter-full-screen');
      });

      this.browserWindow.on('leave-full-screen', () => {
        return this.browserWindow.webContents.send('did-leave-full-screen');
      });

      this.browserWindow.loadURL(url.format({
        protocol: 'file',
        pathname: `${this.resourcePath}/static/index.html`,
        slashes: true
      })
      );

      this.browserWindow.showSaveDialog = this.showSaveDialog.bind(this);

      if (this.isSpec) { this.browserWindow.focusOnWebView(); }
      if (typeof windowDimensions !== 'undefined' && windowDimensions !== null) { this.browserWindow.temporaryState = {windowDimensions}; }

      const hasPathToOpen = !((locationsToOpen.length === 1) && (locationsToOpen[0].pathToOpen == null));
      if (hasPathToOpen && !this.isSpecWindow()) { this.openLocations(locationsToOpen); }

      this.atomApplication.addWindow(this);
    }

    hasProjectPath() { return this.representedDirectoryPaths.length > 0; }

    setupContextMenu() {
      const ContextMenu = require('./context-menu');

      return this.browserWindow.on('context-menu', menuTemplate => {
        return new ContextMenu(menuTemplate, this);
      });
    }

    containsPaths(paths) {
      for (let pathToCheck of Array.from(paths)) {
        if (!this.containsPath(pathToCheck)) { return false; }
      }
      return true;
    }

    containsPath(pathToCheck) {
      return this.representedDirectoryPaths.some(function(projectPath) {
        if (!projectPath) {
          return false;
        } else if (!pathToCheck) {
          return false;
        } else if (pathToCheck === projectPath) {
          return true;
        } else if (__guardMethod__(fs.statSyncNoException(pathToCheck), 'isDirectory', o => o.isDirectory())) {
          return false;
        } else if (pathToCheck.indexOf(path.join(projectPath, path.sep)) === 0) {
          return true;
        } else {
          return false;
        }
      });
    }

    handleEvents() {
      this.browserWindow.on('close', event => {
        if (!this.atomApplication.quitting && !this.unloading) {
          event.preventDefault();
          this.unloading = true;
          this.atomApplication.saveState(false);
          return this.prepareToUnload().then(result => {
            if (result) { return this.close(); }
          });
        }
      });

      this.browserWindow.on('closed', () => {
        this.fileRecoveryService.didCloseWindow(this);
        this.atomApplication.removeWindow(this);
        return this.resolveClosedPromise();
      });

      this.browserWindow.on('unresponsive', () => {
        if (this.isSpec) { return; }

        const chosen = dialog.showMessageBox(this.browserWindow, {
          type: 'warning',
          buttons: ['Force Close', 'Keep Waiting'],
          message: 'Editor is not responding',
          detail: 'The editor is not responding. Would you like to force close it or just keep waiting?'
        }
        );
        if (chosen === 0) { return this.browserWindow.destroy(); }
      });

      this.browserWindow.webContents.on('crashed', () => {
        if (this.headless) {
          console.log("Renderer process crashed, exiting");
          this.atomApplication.exit(100);
          return;
        }

        this.fileRecoveryService.didCrashWindow(this);
        const chosen = dialog.showMessageBox(this.browserWindow, {
          type: 'warning',
          buttons: ['Close Window', 'Reload', 'Keep It Open'],
          message: 'The editor has crashed',
          detail: 'Please report this issue to https://github.com/atom/atom'
        }
        );
        switch (chosen) {
          case 0: return this.browserWindow.destroy();
          case 1: return this.browserWindow.reload();
        }
      });

      this.browserWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== this.browserWindow.webContents.getURL()) {
          return event.preventDefault();
        }
      });

      this.setupContextMenu();

      if (this.isSpec) {
        // Spec window's web view should always have focus
        return this.browserWindow.on('blur', () => {
          return this.browserWindow.focusOnWebView();
        });
      }
    }

    prepareToUnload() {
      if (this.isSpecWindow()) {
        return Promise.resolve(true);
      }
      return this.lastPrepareToUnloadPromise = new Promise(resolve => {
        var callback = (event, result) => {
          if (BrowserWindow.fromWebContents(event.sender) === this.browserWindow) {
            ipcMain.removeListener('did-prepare-to-unload', callback);
            if (!result) {
              this.unloading = false;
              this.atomApplication.quitting = false;
            }
            return resolve(result);
          }
        };
        ipcMain.on('did-prepare-to-unload', callback);
        return this.browserWindow.webContents.send('prepare-to-unload');
      });
    }

    openPath(pathToOpen, initialLine, initialColumn) {
      return this.openLocations([{pathToOpen, initialLine, initialColumn}]);
    }

    openLocations(locationsToOpen) {
      return this.loadedPromise.then(() => this.sendMessage('open-locations', locationsToOpen));
    }

    replaceEnvironment(env) {
      return this.browserWindow.webContents.send('environment', env);
    }

    sendMessage(message, detail) {
      return this.browserWindow.webContents.send('message', message, detail);
    }

    sendCommand(command, ...args) {
      if (this.isSpecWindow()) {
        if (!this.atomApplication.sendCommandToFirstResponder(command)) {
          switch (command) {
            case 'window:reload': return this.reload();
            case 'window:toggle-dev-tools': return this.toggleDevTools();
            case 'window:close': return this.close();
          }
        }
      } else if (this.isWebViewFocused()) {
        return this.sendCommandToBrowserWindow(command, ...Array.from(args));
      } else {
        if (!this.atomApplication.sendCommandToFirstResponder(command)) {
          return this.sendCommandToBrowserWindow(command, ...Array.from(args));
        }
      }
    }

    sendCommandToBrowserWindow(command, ...args) {
      const action = (args[0] != null ? args[0].contextCommand : undefined) ? 'context-command' : 'command';
      return this.browserWindow.webContents.send(action, command, ...Array.from(args));
    }

    getDimensions() {
      const [x, y] = Array.from(this.browserWindow.getPosition());
      const [width, height] = Array.from(this.browserWindow.getSize());
      return {x, y, width, height};
    }

    shouldAddCustomTitleBar() {
      return !this.isSpec &&
      (process.platform === 'darwin') &&
      (this.atomApplication.config.get('core.titleBar') === 'custom');
    }

    shouldAddCustomInsetTitleBar() {
      return !this.isSpec &&
      (process.platform === 'darwin') &&
      (this.atomApplication.config.get('core.titleBar') === 'custom-inset');
    }

    shouldHideTitleBar() {
      return !this.isSpec &&
      (process.platform === 'darwin') &&
      (this.atomApplication.config.get('core.titleBar') === 'hidden');
    }

    close() { return this.browserWindow.close(); }

    focus() { return this.browserWindow.focus(); }

    minimize() { return this.browserWindow.minimize(); }

    maximize() { return this.browserWindow.maximize(); }

    unmaximize() { return this.browserWindow.unmaximize(); }

    restore() { return this.browserWindow.restore(); }

    setFullScreen(fullScreen) { return this.browserWindow.setFullScreen(fullScreen); }

    setAutoHideMenuBar(autoHideMenuBar) { return this.browserWindow.setAutoHideMenuBar(autoHideMenuBar); }

    handlesAtomCommands() {
      return !this.isSpecWindow() && this.isWebViewFocused();
    }

    isFocused() { return this.browserWindow.isFocused(); }

    isMaximized() { return this.browserWindow.isMaximized(); }

    isMinimized() { return this.browserWindow.isMinimized(); }

    isWebViewFocused() { return this.browserWindow.isWebViewFocused(); }

    isSpecWindow() { return this.isSpec; }

    reload() {
      this.loadedPromise = new Promise(resolveLoadedPromise => {
        this.resolveLoadedPromise = resolveLoadedPromise;
        
    });
      this.prepareToUnload().then(result => {
        if (result) { return this.browserWindow.reload(); }
      });
      return this.loadedPromise;
    }

    showSaveDialog(params) {
      params = Object.assign({
        title: 'Save File',
        defaultPath: this.representedDirectoryPaths[0]
      }, params);
      return dialog.showSaveDialog(this.browserWindow, params);
    }

    toggleDevTools() { return this.browserWindow.toggleDevTools(); }

    openDevTools() { return this.browserWindow.openDevTools(); }

    closeDevTools() { return this.browserWindow.closeDevTools(); }

    setDocumentEdited(documentEdited) { return this.browserWindow.setDocumentEdited(documentEdited); }

    setRepresentedFilename(representedFilename) { return this.browserWindow.setRepresentedFilename(representedFilename); }

    setRepresentedDirectoryPaths(representedDirectoryPaths) {
      this.representedDirectoryPaths = representedDirectoryPaths;
      this.representedDirectoryPaths.sort();
      this.loadSettings.initialPaths = this.representedDirectoryPaths;
      this.browserWindow.loadSettingsJSON = JSON.stringify(this.loadSettings);
      return this.atomApplication.saveState();
    }

    copy() { return this.browserWindow.copy(); }

    disableZoom() {
      return this.browserWindow.webContents.setVisualZoomLevelLimits(1, 1);
    }
  };
  AtomWindow.initClass();
  return AtomWindow;
})());

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}