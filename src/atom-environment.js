/** @babel */
/* eslint-disable
    constructor-super,
    no-cond-assign,
    no-constant-condition,
    no-eval,
    no-extend-native,
    no-return-assign,
    no-this-before-super,
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let AtomEnvironment
const crypto = require('crypto')
const path = require('path')
const { ipcRenderer } = require('electron')

const _ = require('underscore-plus')
const { deprecate } = require('grim')
const { CompositeDisposable, Disposable, Emitter } = require('event-kit')
const fs = require('fs-plus')
const { mapSourcePosition } = require('@atom/source-map-support')
const Model = require('./model')
const WindowEventHandler = require('./window-event-handler')
const StateStore = require('./state-store')
const StorageFolder = require('./storage-folder')
const registerDefaultCommands = require('./register-default-commands')
const { updateProcessEnv } = require('./update-process-env')
const ConfigSchema = require('./config-schema')

const DeserializerManager = require('./deserializer-manager')
const ViewRegistry = require('./view-registry')
const NotificationManager = require('./notification-manager')
const Config = require('./config')
const KeymapManager = require('./keymap-extensions')
const TooltipManager = require('./tooltip-manager')
const CommandRegistry = require('./command-registry')
const GrammarRegistry = require('./grammar-registry')
const { HistoryManager, HistoryProject } = require('./history-manager')
const ReopenProjectMenuManager = require('./reopen-project-menu-manager')
const StyleManager = require('./style-manager')
const PackageManager = require('./package-manager')
const ThemeManager = require('./theme-manager')
const MenuManager = require('./menu-manager')
const ContextMenuManager = require('./context-menu-manager')
const CommandInstaller = require('./command-installer')
let Project = require('./project')
const TitleBar = require('./title-bar')
const Workspace = require('./workspace')
const PanelContainer = require('./panel-container')
const Panel = require('./panel')
const PaneContainer = require('./pane-container')
const PaneAxis = require('./pane-axis')
const Pane = require('./pane')
const Dock = require('./dock')
Project = require('./project')
const TextEditor = require('./text-editor')
const TextBuffer = require('text-buffer')
const Gutter = require('./gutter')
const TextEditorRegistry = require('./text-editor-registry')
const AutoUpdateManager = require('./auto-update-manager')

// Essential: Atom global for dealing with packages, themes, menus, and the window.
//
// An instance of this class is always available as the `atom` global.
module.exports =
(AtomEnvironment = (function () {
  AtomEnvironment = class AtomEnvironment extends Model {
    static initClass () {
      this.version = 1 // Increment this when the serialization format changes

      this.prototype.lastUncaughtError = null

      /*
      Section: Properties
      */

      // Public: A {CommandRegistry} instance
      this.prototype.commands = null

      // Public: A {Config} instance
      this.prototype.config = null

      // Public: A {Clipboard} instance
      this.prototype.clipboard = null

      // Public: A {ContextMenuManager} instance
      this.prototype.contextMenu = null

      // Public: A {MenuManager} instance
      this.prototype.menu = null

      // Public: A {KeymapManager} instance
      this.prototype.keymaps = null

      // Public: A {TooltipManager} instance
      this.prototype.tooltips = null

      // Public: A {NotificationManager} instance
      this.prototype.notifications = null

      // Public: A {Project} instance
      this.prototype.project = null

      // Public: A {GrammarRegistry} instance
      this.prototype.grammars = null

      // Public: A {HistoryManager} instance
      this.prototype.history = null

      // Public: A {PackageManager} instance
      this.prototype.packages = null

      // Public: A {ThemeManager} instance
      this.prototype.themes = null

      // Public: A {StyleManager} instance
      this.prototype.styles = null

      // Public: A {DeserializerManager} instance
      this.prototype.deserializers = null

      // Public: A {ViewRegistry} instance
      this.prototype.views = null

      // Public: A {Workspace} instance
      this.prototype.workspace = null

      // Public: A {TextEditorRegistry} instance
      this.prototype.textEditors = null

      // Private: An {AutoUpdateManager} instance
      this.prototype.autoUpdater = null

      this.prototype.saveStateDebounceInterval = 1000
    }

    /*
    Section: Construction and Destruction
    */

    // Call .loadOrCreate instead
    constructor (params) {
      let onlyLoadBaseStyleSheets
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super() }
        let thisFn = (() => { return this }).toString()
        let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1]
        eval(`${thisName} = this;`)
      }
      if (params == null) { params = {} }
      ({ applicationDelegate: this.applicationDelegate, clipboard: this.clipboard, enablePersistence: this.enablePersistence, onlyLoadBaseStyleSheets, updateProcessEnv: this.updateProcessEnv } = params)

      this.nextProxyRequestId = 0
      this.unloaded = false
      this.loadTime = null
      this.emitter = new Emitter()
      this.disposables = new CompositeDisposable()
      this.deserializers = new DeserializerManager(this)
      this.deserializeTimings = {}
      this.views = new ViewRegistry(this)
      TextEditor.setScheduler(this.views)
      this.notifications = new NotificationManager()
      if (this.updateProcessEnv == null) { this.updateProcessEnv = updateProcessEnv } // For testing

      this.stateStore = new StateStore('AtomEnvironments', 1)

      this.config = new Config({ notificationManager: this.notifications, enablePersistence: this.enablePersistence })
      this.config.setSchema(null, { type: 'object', properties: _.clone(ConfigSchema) })

      this.keymaps = new KeymapManager({ notificationManager: this.notifications })
      this.tooltips = new TooltipManager({ keymapManager: this.keymaps, viewRegistry: this.views })
      this.commands = new CommandRegistry()
      this.grammars = new GrammarRegistry({ config: this.config })
      this.styles = new StyleManager()
      this.packages = new PackageManager({
        config: this.config,
        styleManager: this.styles,
        commandRegistry: this.commands,
        keymapManager: this.keymaps,
        notificationManager: this.notifications,
        grammarRegistry: this.grammars,
        deserializerManager: this.deserializers,
        viewRegistry: this.views
      })
      this.themes = new ThemeManager({
        packageManager: this.packages,
        config: this.config,
        styleManager: this.styles,
        notificationManager: this.notifications,
        viewRegistry: this.views
      })
      this.menu = new MenuManager({ keymapManager: this.keymaps, packageManager: this.packages })
      this.contextMenu = new ContextMenuManager({ keymapManager: this.keymaps })
      this.packages.setMenuManager(this.menu)
      this.packages.setContextMenuManager(this.contextMenu)
      this.packages.setThemeManager(this.themes)

      this.project = new Project({ notificationManager: this.notifications, packageManager: this.packages, config: this.config, applicationDelegate: this.applicationDelegate })
      this.commandInstaller = new CommandInstaller(this.applicationDelegate)

      this.textEditors = new TextEditorRegistry({
        config: this.config,
        grammarRegistry: this.grammars,
        assert: this.assert.bind(this),
        packageManager: this.packages
      })

      this.workspace = new Workspace({
        config: this.config,
        project: this.project,
        packageManager: this.packages,
        grammarRegistry: this.grammars,
        deserializerManager: this.deserializers,
        notificationManager: this.notifications,
        applicationDelegate: this.applicationDelegate,
        viewRegistry: this.views,
        assert: this.assert.bind(this),
        textEditorRegistry: this.textEditors,
        styleManager: this.styles,
        enablePersistence: this.enablePersistence
      })

      this.themes.workspace = this.workspace

      this.autoUpdater = new AutoUpdateManager({ applicationDelegate: this.applicationDelegate })

      if (this.keymaps.canLoadBundledKeymapsFromMemory()) {
        this.keymaps.loadBundledKeymaps()
      }

      this.registerDefaultCommands()
      this.registerDefaultOpeners()
      this.registerDefaultDeserializers()

      this.windowEventHandler = new WindowEventHandler({ atomEnvironment: this, applicationDelegate: this.applicationDelegate })

      this.history = new HistoryManager({ project: this.project, commands: this.commands, stateStore: this.stateStore })
      // Keep instances of HistoryManager in sync
      this.disposables.add(this.history.onDidChangeProjects(e => {
        if (!e.reloaded) { return this.applicationDelegate.didChangeHistoryManager() }
      })
      )
    }

    initialize (params) {
      // This will force TextEditorElement to register the custom element, so that
      // using `document.createElement('atom-text-editor')` works if it's called
      // before opening a buffer.
      let onlyLoadBaseStyleSheets
      if (params == null) { params = {} }
      require('./text-editor-element');

      ({ window: this.window, document: this.document, blobStore: this.blobStore, configDirPath: this.configDirPath, onlyLoadBaseStyleSheets } = params)
      const { devMode, safeMode, resourcePath, clearWindowState } = this.getLoadSettings()

      if (clearWindowState) {
        this.getStorageFolder().clear()
        this.stateStore.clear()
      }

      ConfigSchema.projectHome = {
        type: 'string',
        default: path.join(fs.getHomeDirectory(), 'github'),
        description: 'The directory where projects are assumed to be located. Packages created using the Package Generator will be stored here by default.'
      }
      this.config.initialize({ configDirPath: this.configDirPath, resourcePath, projectHomeSchema: ConfigSchema.projectHome })

      this.menu.initialize({ resourcePath })
      this.contextMenu.initialize({ resourcePath, devMode })

      this.keymaps.configDirPath = this.configDirPath
      this.keymaps.resourcePath = resourcePath
      this.keymaps.devMode = devMode
      if (!this.keymaps.canLoadBundledKeymapsFromMemory()) {
        this.keymaps.loadBundledKeymaps()
      }

      this.commands.attach(this.window)

      this.styles.initialize({ configDirPath: this.configDirPath })
      this.packages.initialize({ devMode, configDirPath: this.configDirPath, resourcePath, safeMode })
      this.themes.initialize({ configDirPath: this.configDirPath, resourcePath, safeMode, devMode })

      this.commandInstaller.initialize(this.getVersion())
      this.autoUpdater.initialize()

      this.config.load()

      this.themes.loadBaseStylesheets()
      this.initialStyleElements = this.styles.getSnapshot()
      if (onlyLoadBaseStyleSheets) { this.themes.initialLoadComplete = true }
      this.setBodyPlatformClass()

      this.stylesElement = this.styles.buildStylesElement()
      this.document.head.appendChild(this.stylesElement)

      this.keymaps.subscribeToFileReadFailure()

      this.installUncaughtErrorHandler()
      this.attachSaveStateListeners()
      this.windowEventHandler.initialize(this.window, this.document)

      const didChangeStyles = this.didChangeStyles.bind(this)
      this.disposables.add(this.styles.onDidAddStyleElement(didChangeStyles))
      this.disposables.add(this.styles.onDidUpdateStyleElement(didChangeStyles))
      this.disposables.add(this.styles.onDidRemoveStyleElement(didChangeStyles))

      this.observeAutoHideMenuBar()

      return this.disposables.add(this.applicationDelegate.onDidChangeHistoryManager(() => this.history.loadState()))
    }

    preloadPackages () {
      return this.packages.preloadPackages()
    }

    attachSaveStateListeners () {
      const saveState = _.debounce(() => {
        return this.window.requestIdleCallback(() => { if (!this.unloaded) { return this.saveState({ isUnloading: false }) } })
      }
      , this.saveStateDebounceInterval)
      this.document.addEventListener('mousedown', saveState, true)
      this.document.addEventListener('keydown', saveState, true)
      return this.disposables.add(new Disposable(() => {
        this.document.removeEventListener('mousedown', saveState, true)
        return this.document.removeEventListener('keydown', saveState, true)
      })
      )
    }

    registerDefaultDeserializers () {
      this.deserializers.add(Workspace)
      this.deserializers.add(PaneContainer)
      this.deserializers.add(PaneAxis)
      this.deserializers.add(Pane)
      this.deserializers.add(Dock)
      this.deserializers.add(Project)
      this.deserializers.add(TextEditor)
      return this.deserializers.add(TextBuffer)
    }

    registerDefaultCommands () {
      return registerDefaultCommands({ commandRegistry: this.commands, config: this.config, commandInstaller: this.commandInstaller, notificationManager: this.notifications, project: this.project, clipboard: this.clipboard })
    }

    registerDefaultOpeners () {
      return this.workspace.addOpener(uri => {
        switch (uri) {
          case 'atom://.atom/stylesheet':
            return this.workspace.openTextFile(this.styles.getUserStyleSheetPath())
          case 'atom://.atom/keymap':
            return this.workspace.openTextFile(this.keymaps.getUserKeymapPath())
          case 'atom://.atom/config':
            return this.workspace.openTextFile(this.config.getUserConfigPath())
          case 'atom://.atom/init-script':
            return this.workspace.openTextFile(this.getUserInitScriptPath())
        }
      })
    }

    registerDefaultTargetForKeymaps () {
      return this.keymaps.defaultTarget = this.workspace.getElement()
    }

    observeAutoHideMenuBar () {
      this.disposables.add(this.config.onDidChange('core.autoHideMenuBar', ({ newValue }) => {
        return this.setAutoHideMenuBar(newValue)
      })
      )
      if (this.config.get('core.autoHideMenuBar')) { return this.setAutoHideMenuBar(true) }
    }

    reset () {
      this.deserializers.clear()
      this.registerDefaultDeserializers()

      this.config.clear()
      this.config.setSchema(null, { type: 'object', properties: _.clone(ConfigSchema) })

      this.keymaps.clear()
      this.keymaps.loadBundledKeymaps()

      this.commands.clear()
      this.registerDefaultCommands()

      this.styles.restoreSnapshot(this.initialStyleElements)

      this.menu.clear()

      this.clipboard.reset()

      this.notifications.clear()

      this.contextMenu.clear()

      this.packages.reset()

      this.workspace.reset(this.packages)
      this.registerDefaultOpeners()

      this.project.reset(this.packages)

      this.workspace.subscribeToEvents()

      this.grammars.clear()

      this.textEditors.clear()

      return this.views.clear()
    }

    destroy () {
      if (!this.project) { return }

      this.disposables.dispose()
      if (this.workspace != null) {
        this.workspace.destroy()
      }
      this.workspace = null
      this.themes.workspace = null
      if (this.project != null) {
        this.project.destroy()
      }
      this.project = null
      this.commands.clear()
      this.stylesElement.remove()
      this.config.unobserveUserConfig()
      this.autoUpdater.destroy()

      return this.uninstallWindowEventHandler()
    }

    /*
    Section: Event Subscription
    */

    // Extended: Invoke the given callback whenever {::beep} is called.
    //
    // * `callback` {Function} to be called whenever {::beep} is called.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidBeep (callback) {
      return this.emitter.on('did-beep', callback)
    }

    // Extended: Invoke the given callback when there is an unhandled error, but
    // before the devtools pop open
    //
    // * `callback` {Function} to be called whenever there is an unhandled error
    //   * `event` {Object}
    //     * `originalError` {Object} the original error object
    //     * `message` {String} the original error object
    //     * `url` {String} Url to the file where the error originated.
    //     * `line` {Number}
    //     * `column` {Number}
    //     * `preventDefault` {Function} call this to avoid popping up the dev tools.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onWillThrowError (callback) {
      return this.emitter.on('will-throw-error', callback)
    }

    // Extended: Invoke the given callback whenever there is an unhandled error.
    //
    // * `callback` {Function} to be called whenever there is an unhandled error
    //   * `event` {Object}
    //     * `originalError` {Object} the original error object
    //     * `message` {String} the original error object
    //     * `url` {String} Url to the file where the error originated.
    //     * `line` {Number}
    //     * `column` {Number}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidThrowError (callback) {
      return this.emitter.on('did-throw-error', callback)
    }

    // TODO: Make this part of the public API. We should make onDidThrowError
    // match the interface by only yielding an exception object to the handler
    // and deprecating the old behavior.
    onDidFailAssertion (callback) {
      return this.emitter.on('did-fail-assertion', callback)
    }

    // Extended: Invoke the given callback as soon as the shell environment is
    // loaded (or immediately if it was already loaded).
    //
    // * `callback` {Function} to be called whenever there is an unhandled error
    whenShellEnvironmentLoaded (callback) {
      if (this.shellEnvironmentLoaded) {
        callback()
        return new Disposable()
      } else {
        return this.emitter.once('loaded-shell-environment', callback)
      }
    }

    /*
    Section: Atom Details
    */

    // Public: Returns a {Boolean} that is `true` if the current window is in development mode.
    inDevMode () {
      return this.devMode != null ? this.devMode : (this.devMode = this.getLoadSettings().devMode)
    }

    // Public: Returns a {Boolean} that is `true` if the current window is in safe mode.
    inSafeMode () {
      return this.safeMode != null ? this.safeMode : (this.safeMode = this.getLoadSettings().safeMode)
    }

    // Public: Returns a {Boolean} that is `true` if the current window is running specs.
    inSpecMode () {
      return this.specMode != null ? this.specMode : (this.specMode = this.getLoadSettings().isSpec)
    }

    // Returns a {Boolean} indicating whether this the first time the window's been
    // loaded.
    isFirstLoad () {
      return this.firstLoad != null ? this.firstLoad : (this.firstLoad = this.getLoadSettings().firstLoad)
    }

    // Public: Get the version of the Atom application.
    //
    // Returns the version text {String}.
    getVersion () {
      return this.appVersion != null ? this.appVersion : (this.appVersion = this.getLoadSettings().appVersion)
    }

    // Returns the release channel as a {String}. Will return one of `'dev', 'beta', 'stable'`
    getReleaseChannel () {
      const version = this.getVersion()
      if (version.indexOf('beta') > -1) {
        return 'beta'
      } else if (version.indexOf('dev') > -1) {
        return 'dev'
      } else {
        return 'stable'
      }
    }

    // Public: Returns a {Boolean} that is `true` if the current version is an official release.
    isReleasedVersion () {
      return !/\w{7}/.test(this.getVersion()) // Check if the release is a 7-character SHA prefix
    }

    // Public: Get the time taken to completely load the current window.
    //
    // This time include things like loading and activating packages, creating
    // DOM elements for the editor, and reading the config.
    //
    // Returns the {Number} of milliseconds taken to load the window or null
    // if the window hasn't finished loading yet.
    getWindowLoadTime () {
      return this.loadTime
    }

    // Public: Get the load settings for the current window.
    //
    // Returns an {Object} containing all the load setting key/value pairs.
    getLoadSettings () {
      return this.applicationDelegate.getWindowLoadSettings()
    }

    /*
    Section: Managing The Atom Window
    */

    // Essential: Open a new Atom window using the given options.
    //
    // Calling this method without an options parameter will open a prompt to pick
    // a file/folder to open in the new window.
    //
    // * `params` An {Object} with the following keys:
    //   * `pathsToOpen`  An {Array} of {String} paths to open.
    //   * `newWindow` A {Boolean}, true to always open a new window instead of
    //     reusing existing windows depending on the paths to open.
    //   * `devMode` A {Boolean}, true to open the window in development mode.
    //     Development mode loads the Atom source from the locally cloned
    //     repository and also loads all the packages in ~/.atom/dev/packages
    //   * `safeMode` A {Boolean}, true to open the window in safe mode. Safe
    //     mode prevents all packages installed to ~/.atom/packages from loading.
    open (params) {
      return this.applicationDelegate.open(params)
    }

    // Extended: Prompt the user to select one or more folders.
    //
    // * `callback` A {Function} to call once the user has confirmed the selection.
    //   * `paths` An {Array} of {String} paths that the user selected, or `null`
    //     if the user dismissed the dialog.
    pickFolder (callback) {
      return this.applicationDelegate.pickFolder(callback)
    }

    // Essential: Close the current window.
    close () {
      return this.applicationDelegate.closeWindow()
    }

    // Essential: Get the size of current window.
    //
    // Returns an {Object} in the format `{width: 1000, height: 700}`
    getSize () {
      return this.applicationDelegate.getWindowSize()
    }

    // Essential: Set the size of current window.
    //
    // * `width` The {Number} of pixels.
    // * `height` The {Number} of pixels.
    setSize (width, height) {
      return this.applicationDelegate.setWindowSize(width, height)
    }

    // Essential: Get the position of current window.
    //
    // Returns an {Object} in the format `{x: 10, y: 20}`
    getPosition () {
      return this.applicationDelegate.getWindowPosition()
    }

    // Essential: Set the position of current window.
    //
    // * `x` The {Number} of pixels.
    // * `y` The {Number} of pixels.
    setPosition (x, y) {
      return this.applicationDelegate.setWindowPosition(x, y)
    }

    // Extended: Get the current window
    getCurrentWindow () {
      return this.applicationDelegate.getCurrentWindow()
    }

    // Extended: Move current window to the center of the screen.
    center () {
      return this.applicationDelegate.centerWindow()
    }

    // Extended: Focus the current window.
    focus () {
      this.applicationDelegate.focusWindow()
      return this.window.focus()
    }

    // Extended: Show the current window.
    show () {
      return this.applicationDelegate.showWindow()
    }

    // Extended: Hide the current window.
    hide () {
      return this.applicationDelegate.hideWindow()
    }

    // Extended: Reload the current window.
    reload () {
      return this.applicationDelegate.reloadWindow()
    }

    // Extended: Relaunch the entire application.
    restartApplication () {
      return this.applicationDelegate.restartApplication()
    }

    // Extended: Returns a {Boolean} that is `true` if the current window is maximized.
    isMaximized () {
      return this.applicationDelegate.isWindowMaximized()
    }

    maximize () {
      return this.applicationDelegate.maximizeWindow()
    }

    // Extended: Returns a {Boolean} that is `true` if the current window is in full screen mode.
    isFullScreen () {
      return this.applicationDelegate.isWindowFullScreen()
    }

    // Extended: Set the full screen state of the current window.
    setFullScreen (fullScreen) {
      if (fullScreen == null) { fullScreen = false }
      return this.applicationDelegate.setWindowFullScreen(fullScreen)
    }

    // Extended: Toggle the full screen state of the current window.
    toggleFullScreen () {
      return this.setFullScreen(!this.isFullScreen())
    }

    // Restore the window to its previous dimensions and show it.
    //
    // Restores the full screen and maximized state after the window has resized to
    // prevent resize glitches.
    displayWindow () {
      return this.restoreWindowDimensions().then(() => {
        const steps = [
          this.restoreWindowBackground(),
          this.show(),
          this.focus()
        ]
        if (this.windowDimensions != null ? this.windowDimensions.fullScreen : undefined) { steps.push(this.setFullScreen(true)) }
        if ((this.windowDimensions != null ? this.windowDimensions.maximized : undefined) && (process.platform !== 'darwin')) { steps.push(this.maximize()) }
        return Promise.all(steps)
      })
    }

    // Get the dimensions of this window.
    //
    // Returns an {Object} with the following keys:
    //   * `x`      The window's x-position {Number}.
    //   * `y`      The window's y-position {Number}.
    //   * `width`  The window's width {Number}.
    //   * `height` The window's height {Number}.
    getWindowDimensions () {
      const browserWindow = this.getCurrentWindow()
      const [x, y] = Array.from(browserWindow.getPosition())
      const [width, height] = Array.from(browserWindow.getSize())
      const maximized = browserWindow.isMaximized()
      return { x, y, width, height, maximized }
    }

    // Set the dimensions of the window.
    //
    // The window will be centered if either the x or y coordinate is not set
    // in the dimensions parameter. If x or y are omitted the window will be
    // centered. If height or width are omitted only the position will be changed.
    //
    // * `dimensions` An {Object} with the following keys:
    //   * `x` The new x coordinate.
    //   * `y` The new y coordinate.
    //   * `width` The new width.
    //   * `height` The new height.
    setWindowDimensions ({ x, y, width, height }) {
      const steps = []
      if ((width != null) && (height != null)) {
        steps.push(this.setSize(width, height))
      }
      if ((x != null) && (y != null)) {
        steps.push(this.setPosition(x, y))
      } else {
        steps.push(this.center())
      }
      return Promise.all(steps)
    }

    // Returns true if the dimensions are useable, false if they should be ignored.
    // Work around for https://github.com/atom/atom-shell/issues/473
    isValidDimensions (param) {
      if (param == null) { param = {} }
      const { x, y, width, height } = param
      return (width > 0) && (height > 0) && ((x + width) > 0) && ((y + height) > 0)
    }

    storeWindowDimensions () {
      this.windowDimensions = this.getWindowDimensions()
      if (this.isValidDimensions(this.windowDimensions)) {
        return localStorage.setItem('defaultWindowDimensions', JSON.stringify(this.windowDimensions))
      }
    }

    getDefaultWindowDimensions () {
      const { windowDimensions } = this.getLoadSettings()
      if (windowDimensions != null) { return windowDimensions }

      let dimensions = null
      try {
        dimensions = JSON.parse(localStorage.getItem('defaultWindowDimensions'))
      } catch (error) {
        console.warn('Error parsing default window dimensions', error)
        localStorage.removeItem('defaultWindowDimensions')
      }

      if (this.isValidDimensions(dimensions)) {
        return dimensions
      } else {
        const { width, height } = this.applicationDelegate.getPrimaryDisplayWorkAreaSize()
        return { x: 0, y: 0, width: Math.min(1024, width), height }
      }
    }

    restoreWindowDimensions () {
      if ((this.windowDimensions == null) || !this.isValidDimensions(this.windowDimensions)) {
        this.windowDimensions = this.getDefaultWindowDimensions()
      }
      return this.setWindowDimensions(this.windowDimensions).then(() => this.windowDimensions)
    }

    restoreWindowBackground () {
      let backgroundColor
      if (backgroundColor = window.localStorage.getItem('atom:window-background-color')) {
        this.backgroundStylesheet = document.createElement('style')
        this.backgroundStylesheet.type = 'text/css'
        this.backgroundStylesheet.innerText = `html, body { background: ${backgroundColor} !important; }`
        return document.head.appendChild(this.backgroundStylesheet)
      }
    }

    storeWindowBackground () {
      if (this.inSpecMode()) { return }

      const backgroundColor = this.window.getComputedStyle(this.workspace.getElement())['background-color']
      return this.window.localStorage.setItem('atom:window-background-color', backgroundColor)
    }

    // Call this method when establishing a real application window.
    startEditorWindow () {
      this.unloaded = false

      const updateProcessEnvPromise = this.updateProcessEnvAndTriggerHooks()

      const loadStatePromise = this.loadState().then(state => {
        this.windowDimensions = state != null ? state.windowDimensions : undefined
        return this.displayWindow().then(() => {
          this.commandInstaller.installAtomCommand(false, function (error) {
            if (error != null) { return console.warn(error.message) }
          })
          this.commandInstaller.installApmCommand(false, function (error) {
            if (error != null) { return console.warn(error.message) }
          })

          this.disposables.add(this.applicationDelegate.onDidOpenLocations(this.openLocations.bind(this)))
          this.disposables.add(this.applicationDelegate.onApplicationMenuCommand(this.dispatchApplicationMenuCommand.bind(this)))
          this.disposables.add(this.applicationDelegate.onContextMenuCommand(this.dispatchContextMenuCommand.bind(this)))
          this.disposables.add(this.applicationDelegate.onDidRequestUnload(() => {
            return this.saveState({ isUnloading: true })
              .catch(console.error)
              .then(() => {
                return (this.workspace != null ? this.workspace.confirmClose({
                  windowCloseRequested: true,
                  projectHasPaths: this.project.getPaths().length > 0
                }) : undefined)
              })
          })
          )

          this.listenForUpdates()

          this.registerDefaultTargetForKeymaps()

          this.packages.loadPackages()

          const startTime = Date.now()
          return this.deserialize(state).then(() => {
            this.deserializeTimings.atom = Date.now() - startTime

            if ((process.platform === 'darwin') && (this.config.get('core.titleBar') === 'custom')) {
              this.workspace.addHeaderPanel({ item: new TitleBar({ workspace: this.workspace, themes: this.themes, applicationDelegate: this.applicationDelegate }) })
              this.document.body.classList.add('custom-title-bar')
            }
            if ((process.platform === 'darwin') && (this.config.get('core.titleBar') === 'custom-inset')) {
              this.workspace.addHeaderPanel({ item: new TitleBar({ workspace: this.workspace, themes: this.themes, applicationDelegate: this.applicationDelegate }) })
              this.document.body.classList.add('custom-inset-title-bar')
            }
            if ((process.platform === 'darwin') && (this.config.get('core.titleBar') === 'hidden')) {
              this.document.body.classList.add('hidden-title-bar')
            }

            this.document.body.appendChild(this.workspace.getElement())
            if (this.backgroundStylesheet != null) {
              this.backgroundStylesheet.remove()
            }

            this.watchProjectPaths()

            this.packages.activate()
            this.keymaps.loadUserKeymap()
            if (!this.getLoadSettings().safeMode) { this.requireUserInitScript() }

            this.menu.update()

            return this.openInitialEmptyEditorIfNecessary()
          })
        })
      })

      const loadHistoryPromise = this.history.loadState().then(() => {
        this.reopenProjectMenuManager = new ReopenProjectMenuManager({
          menu: this.menu,
          commands: this.commands,
          history: this.history,
          config: this.config,
          open: paths => this.open({ pathsToOpen: paths })
        })
        return this.reopenProjectMenuManager.update()
      })

      return Promise.all([loadStatePromise, loadHistoryPromise, updateProcessEnvPromise])
    }

    serialize (options) {
      return {
        version: this.constructor.version,
        project: this.project.serialize(options),
        workspace: this.workspace.serialize(),
        packageStates: this.packages.serialize(),
        grammars: { grammarOverridesByPath: this.grammars.grammarOverridesByPath },
        fullScreen: this.isFullScreen(),
        windowDimensions: this.windowDimensions,
        textEditors: this.textEditors.serialize()
      }
    }

    unloadEditorWindow () {
      if (!this.project) { return }

      this.storeWindowBackground()
      this.packages.deactivatePackages()
      this.saveBlobStoreSync()
      return this.unloaded = true
    }

    saveBlobStoreSync () {
      if (this.enablePersistence) {
        return this.blobStore.save()
      }
    }

    openInitialEmptyEditorIfNecessary () {
      if (!this.config.get('core.openEmptyEditorOnStart')) { return }
      if ((__guard__(this.getLoadSettings().initialPaths, x => x.length) === 0) && (this.workspace.getPaneItems().length === 0)) {
        return this.workspace.open(null)
      }
    }

    installUncaughtErrorHandler () {
      this.previousWindowErrorHandler = this.window.onerror
      return this.window.onerror = function () {
        let source
        this.lastUncaughtError = Array.prototype.slice.call(arguments)
        let [message, url, line, column, originalError] = Array.from(this.lastUncaughtError);

        ({ line, column, source } = mapSourcePosition({ source: url, line, column }))

        if (url === '<embedded>') {
          url = source
        }

        const eventObject = { message, url, line, column, originalError }

        let openDevTools = true
        eventObject.preventDefault = () => openDevTools = false

        this.emitter.emit('will-throw-error', eventObject)

        if (openDevTools) {
          this.openDevTools().then(() => this.executeJavaScriptInDevTools('DevToolsAPI.showPanel("console")'))
        }

        return this.emitter.emit('did-throw-error', { message, url, line, column, originalError })
      }.bind(this)
    }

    uninstallUncaughtErrorHandler () {
      return this.window.onerror = this.previousWindowErrorHandler
    }

    installWindowEventHandler () {
      this.windowEventHandler = new WindowEventHandler({ atomEnvironment: this, applicationDelegate: this.applicationDelegate })
      return this.windowEventHandler.initialize(this.window, this.document)
    }

    uninstallWindowEventHandler () {
      if (this.windowEventHandler != null) {
        this.windowEventHandler.unsubscribe()
      }
      return this.windowEventHandler = null
    }

    didChangeStyles (styleElement) {
      TextEditor.didUpdateStyles()
      if (styleElement.textContent.indexOf('scrollbar') >= 0) {
        return TextEditor.didUpdateScrollbarStyles()
      }
    }

    updateProcessEnvAndTriggerHooks () {
      return this.updateProcessEnv(this.getLoadSettings().env).then(() => {
        this.shellEnvironmentLoaded = true
        this.emitter.emit('loaded-shell-environment')
        return this.packages.triggerActivationHook('core:loaded-shell-environment')
      })
    }

    /*
    Section: Messaging the User
    */

    // Essential: Visually and audibly trigger a beep.
    beep () {
      if (this.config.get('core.audioBeep')) { this.applicationDelegate.playBeepSound() }
      return this.emitter.emit('did-beep')
    }

    // Essential: A flexible way to open a dialog akin to an alert dialog.
    //
    // ## Examples
    //
    // ```coffee
    // atom.confirm
    //   message: 'How you feeling?'
    //   detailedMessage: 'Be honest.'
    //   buttons:
    //     Good: -> window.alert('good to hear')
    //     Bad: -> window.alert('bummer')
    // ```
    //
    // * `options` An {Object} with the following keys:
    //   * `message` The {String} message to display.
    //   * `detailedMessage` (optional) The {String} detailed message to display.
    //   * `buttons` (optional) Either an array of strings or an object where keys are
    //     button names and the values are callbacks to invoke when clicked.
    //
    // Returns the chosen button index {Number} if the buttons option was an array.
    confirm (params) {
      if (params == null) { params = {} }
      return this.applicationDelegate.confirm(params)
    }

    /*
    Section: Managing the Dev Tools
    */

    // Extended: Open the dev tools for the current window.
    //
    // Returns a {Promise} that resolves when the DevTools have been opened.
    openDevTools () {
      return this.applicationDelegate.openWindowDevTools()
    }

    // Extended: Toggle the visibility of the dev tools for the current window.
    //
    // Returns a {Promise} that resolves when the DevTools have been opened or
    // closed.
    toggleDevTools () {
      return this.applicationDelegate.toggleWindowDevTools()
    }

    // Extended: Execute code in dev tools.
    executeJavaScriptInDevTools (code) {
      return this.applicationDelegate.executeJavaScriptInWindowDevTools(code)
    }

    /*
    Section: Private
    */

    assert (condition, message, callbackOrMetadata) {
      if (condition) { return true }

      const error = new Error(`Assertion failed: ${message}`)
      Error.captureStackTrace(error, this.assert)

      if (callbackOrMetadata != null) {
        if (typeof callbackOrMetadata === 'function') {
          if (typeof callbackOrMetadata === 'function') {
            callbackOrMetadata(error)
          }
        } else {
          error.metadata = callbackOrMetadata
        }
      }

      this.emitter.emit('did-fail-assertion', error)
      if (!this.isReleasedVersion()) {
        throw error
      }

      return false
    }

    loadThemes () {
      return this.themes.load()
    }

    // Notify the browser project of the window's current project path
    watchProjectPaths () {
      return this.disposables.add(this.project.onDidChangePaths(() => {
        return this.applicationDelegate.setRepresentedDirectoryPaths(this.project.getPaths())
      })
      )
    }

    setDocumentEdited (edited) {
      return (typeof this.applicationDelegate.setWindowDocumentEdited === 'function' ? this.applicationDelegate.setWindowDocumentEdited(edited) : undefined)
    }

    setRepresentedFilename (filename) {
      return (typeof this.applicationDelegate.setWindowRepresentedFilename === 'function' ? this.applicationDelegate.setWindowRepresentedFilename(filename) : undefined)
    }

    addProjectFolder () {
      return this.pickFolder(selectedPaths => {
        if (selectedPaths == null) { selectedPaths = [] }
        return this.addToProject(selectedPaths)
      })
    }

    addToProject (projectPaths) {
      return this.loadState(this.getStateKey(projectPaths)).then(state => {
        if (state && (this.project.getPaths().length === 0)) {
          return this.attemptRestoreProjectStateForPaths(state, projectPaths)
        } else {
          return Array.from(projectPaths).map((folder) => this.project.addPath(folder))
        }
      })
    }

    attemptRestoreProjectStateForPaths (state, projectPaths, filesToOpen) {
      let file
      if (filesToOpen == null) { filesToOpen = [] }
      const center = this.workspace.getCenter()
      const windowIsUnused = () => {
        for (let container of Array.from(this.workspace.getPaneContainers())) {
          for (let item of Array.from(container.getPaneItems())) {
            if (item instanceof TextEditor) {
              if (item.getPath() || item.isModified()) { return false }
            } else {
              if (container === center) { return false }
            }
          }
        }
        return true
      }

      if (windowIsUnused()) {
        this.restoreStateIntoThisEnvironment(state)
        return Promise.all(((() => {
          const result = []
          for (file of Array.from(filesToOpen)) {
            result.push(this.workspace.open(file))
          }
          return result
        })()))
      } else {
        const nouns = projectPaths.length === 1 ? 'folder' : 'folders'
        const btn = this.confirm({
          message: 'Previous automatically-saved project state detected',
          detailedMessage: `There is previously saved state for the selected ${nouns}. ` +
            `Would you like to add the ${nouns} to this window, permanently discarding the saved state, ` +
            `or open the ${nouns} in a new window, restoring the saved state?`,
          buttons: [
            '&Open in new window and recover state',
            '&Add to this window and discard state'
          ] })
        if (btn === 0) {
          this.open({
            pathsToOpen: projectPaths.concat(filesToOpen),
            newWindow: true,
            devMode: this.inDevMode(),
            safeMode: this.inSafeMode()
          })
          return Promise.resolve(null)
        } else if (btn === 1) {
          for (let selectedPath of Array.from(projectPaths)) { this.project.addPath(selectedPath) }
          return Promise.all(((() => {
            const result1 = []
            for (file of Array.from(filesToOpen)) {
              result1.push(this.workspace.open(file))
            }
            return result1
          })()))
        }
      }
    }

    restoreStateIntoThisEnvironment (state) {
      state.fullScreen = this.isFullScreen()
      for (let pane of Array.from(this.workspace.getPanes())) { pane.destroy() }
      return this.deserialize(state)
    }

    showSaveDialog (callback) {
      return callback(this.showSaveDialogSync())
    }

    showSaveDialogSync (options) {
      if (options == null) { options = {} }
      return this.applicationDelegate.showSaveDialog(options)
    }

    saveState (options, storageKey) {
      return new Promise((resolve, reject) => {
        if (this.enablePersistence && this.project) {
          const state = this.serialize(options)
          const savePromise =
            storageKey != null ? storageKey : (storageKey = this.getStateKey(this.project != null ? this.project.getPaths() : undefined))
              ? this.stateStore.save(storageKey, state)
              : this.applicationDelegate.setTemporaryWindowState(state)
          return savePromise.catch(reject).then(resolve)
        } else {
          return resolve()
        }
      })
    }

    loadState (stateKey) {
      if (this.enablePersistence) {
        if (stateKey != null ? stateKey : (stateKey = this.getStateKey(this.getLoadSettings().initialPaths))) {
          return this.stateStore.load(stateKey).then(state => {
            if (state) {
              return state
            } else {
              // TODO: remove this when every user has migrated to the IndexedDb state store.
              return this.getStorageFolder().load(stateKey)
            }
          })
        } else {
          return this.applicationDelegate.getTemporaryWindowState()
        }
      } else {
        return Promise.resolve(null)
      }
    }

    deserialize (state) {
      let grammarOverridesByPath, projectPromise
      if (state == null) { return Promise.resolve() }

      if (grammarOverridesByPath = state.grammars != null ? state.grammars.grammarOverridesByPath : undefined) {
        this.grammars.grammarOverridesByPath = grammarOverridesByPath
      }

      this.setFullScreen(state.fullScreen)

      this.packages.packageStates = state.packageStates != null ? state.packageStates : {}

      let startTime = Date.now()
      if (state.project != null) {
        projectPromise = this.project.deserialize(state.project, this.deserializers)
      } else {
        projectPromise = Promise.resolve()
      }

      return projectPromise.then(() => {
        this.deserializeTimings.project = Date.now() - startTime

        if (state.textEditors) { this.textEditors.deserialize(state.textEditors) }

        startTime = Date.now()
        if (state.workspace != null) { this.workspace.deserialize(state.workspace, this.deserializers) }
        return this.deserializeTimings.workspace = Date.now() - startTime
      })
    }

    getStateKey (paths) {
      if ((paths != null ? paths.length : undefined) > 0) {
        const sha1 = crypto.createHash('sha1').update(paths.slice().sort().join('\n')).digest('hex')
        return `editor-${sha1}`
      } else {
        return null
      }
    }

    getStorageFolder () {
      return this.storageFolder != null ? this.storageFolder : (this.storageFolder = new StorageFolder(this.getConfigDirPath()))
    }

    getConfigDirPath () {
      return this.configDirPath != null ? this.configDirPath : (this.configDirPath = process.env.ATOM_HOME)
    }

    getUserInitScriptPath () {
      const initScriptPath = fs.resolve(this.getConfigDirPath(), 'init', ['js', 'coffee'])
      return initScriptPath != null ? initScriptPath : path.join(this.getConfigDirPath(), 'init.coffee')
    }

    requireUserInitScript () {
      let userInitScriptPath
      if (userInitScriptPath = this.getUserInitScriptPath()) {
        try {
          if (fs.isFileSync(userInitScriptPath)) { return require(userInitScriptPath) }
        } catch (error) {
          return this.notifications.addError(`Failed to load \`${userInitScriptPath}\``, {
            detail: error.message,
            dismissable: true
          }
          )
        }
      }
    }

    // TODO: We should deprecate the update events here, and use `atom.autoUpdater` instead
    onUpdateAvailable (callback) {
      return this.emitter.on('update-available', callback)
    }

    updateAvailable (details) {
      return this.emitter.emit('update-available', details)
    }

    listenForUpdates () {
      // listen for updates available locally (that have been successfully downloaded)
      return this.disposables.add(this.autoUpdater.onDidCompleteDownloadingUpdate(this.updateAvailable.bind(this)))
    }

    setBodyPlatformClass () {
      return this.document.body.classList.add(`platform-${process.platform}`)
    }

    setAutoHideMenuBar (autoHide) {
      this.applicationDelegate.setAutoHideWindowMenuBar(autoHide)
      return this.applicationDelegate.setWindowMenuBarVisibility(!autoHide)
    }

    dispatchApplicationMenuCommand (command, arg) {
      let { activeElement } = this.document
      // Use the workspace element if body has focus
      if (activeElement === this.document.body) {
        activeElement = this.workspace.getElement()
      }
      return this.commands.dispatch(activeElement, command, arg)
    }

    dispatchContextMenuCommand (command, ...args) {
      return this.commands.dispatch(this.contextMenu.activeElement, command, args)
    }

    openLocations (locations) {
      let initialColumn, initialLine, pathToOpen
      let forceAddToWindow
      const needsProjectPaths = (this.project != null ? this.project.getPaths().length : undefined) === 0

      const foldersToAddToProject = []
      const fileLocationsToOpen = []

      const pushFolderToOpen = function (folder) {
        if (!Array.from(foldersToAddToProject).includes(folder)) {
          return foldersToAddToProject.push(folder)
        }
      }

      for ({ pathToOpen, initialLine, initialColumn, forceAddToWindow } of Array.from(locations)) {
        if ((pathToOpen != null) && (needsProjectPaths || forceAddToWindow)) {
          if (fs.existsSync(pathToOpen)) {
            pushFolderToOpen(this.project.getDirectoryForProjectPath(pathToOpen).getPath())
          } else if (fs.existsSync(path.dirname(pathToOpen))) {
            pushFolderToOpen(this.project.getDirectoryForProjectPath(path.dirname(pathToOpen)).getPath())
          } else {
            pushFolderToOpen(this.project.getDirectoryForProjectPath(pathToOpen).getPath())
          }
        }

        if (!fs.isDirectorySync(pathToOpen)) {
          fileLocationsToOpen.push({ pathToOpen, initialLine, initialColumn })
        }
      }

      let promise = Promise.resolve(null)
      if (foldersToAddToProject.length > 0) {
        promise = this.loadState(this.getStateKey(foldersToAddToProject)).then(state => {
          if (state && needsProjectPaths) { // only load state if this is the first path added to the project
            const files = (Array.from(fileLocationsToOpen).map((location) => location.pathToOpen))
            return this.attemptRestoreProjectStateForPaths(state, foldersToAddToProject, files)
          } else {
            const promises = []
            for (let folder of Array.from(foldersToAddToProject)) { this.project.addPath(folder) }
            for ({ pathToOpen, initialLine, initialColumn } of Array.from(fileLocationsToOpen)) {
              promises.push(this.workspace != null ? this.workspace.open(pathToOpen, { initialLine, initialColumn }) : undefined)
            }
            return Promise.all(promises)
          }
        })
      } else {
        const promises = []
        for ({ pathToOpen, initialLine, initialColumn } of Array.from(fileLocationsToOpen)) {
          promises.push(this.workspace != null ? this.workspace.open(pathToOpen, { initialLine, initialColumn }) : undefined)
        }
        promise = Promise.all(promises)
      }

      return promise.then(() => ipcRenderer.send('window-command', 'window:locations-opened'))
    }

    resolveProxy (url) {
      return new Promise((resolve, reject) => {
        const requestId = this.nextProxyRequestId++
        var disposable = this.applicationDelegate.onDidResolveProxy(function (id, proxy) {
          if (id === requestId) {
            disposable.dispose()
            return resolve(proxy)
          }
        })

        return this.applicationDelegate.resolveProxy(requestId, url)
      })
    }
  }
  AtomEnvironment.initClass()
  return AtomEnvironment
})())

// Preserve this deprecation until 2.0. Sorry. Should have removed Q sooner.
Promise.prototype.done = function (callback) {
  deprecate('Atom now uses ES6 Promises instead of Q. Call promise.then instead of promise.done')
  return this.then(callback)
}

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
