/** @babel */
/* eslint-disable
    handle-callback-err,
    no-cond-assign,
    no-return-assign,
    no-undef,
    standard/no-callback-literal,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Package
let path = require('path')

const _ = require('underscore-plus')
const async = require('async')
const CSON = require('season')
const fs = require('fs-plus')
const { Emitter, CompositeDisposable } = require('event-kit')

const CompileCache = require('./compile-cache')
const ModuleCache = require('./module-cache')
const ScopedProperties = require('./scoped-properties')
const BufferedProcess = require('./buffered-process')

// Extended: Loads and activates a package's main module and resources such as
// stylesheets, keymaps, grammar, editor properties, and menus.
module.exports =
(Package = (function () {
  Package = class Package {
    static initClass () {
      this.prototype.keymaps = null
      this.prototype.menus = null
      this.prototype.stylesheets = null
      this.prototype.stylesheetDisposables = null
      this.prototype.grammars = null
      this.prototype.settings = null
      this.prototype.mainModulePath = null
      this.prototype.resolvedMainModulePath = false
      this.prototype.mainModule = null
      this.prototype.mainInitialized = false
      this.prototype.mainActivated = false
    }

    /*
    Section: Construction
    */

    constructor (params) {
      let left;
      ({
        path: this.path, metadata: this.metadata, bundledPackage: this.bundledPackage, preloadedPackage: this.preloadedPackage, packageManager: this.packageManager, config: this.config, styleManager: this.styleManager, commandRegistry: this.commandRegistry,
        keymapManager: this.keymapManager, notificationManager: this.notificationManager, grammarRegistry: this.grammarRegistry, themeManager: this.themeManager,
        menuManager: this.menuManager, contextMenuManager: this.contextMenuManager, deserializerManager: this.deserializerManager, viewRegistry: this.viewRegistry
      } = params)

      this.emitter = new Emitter()
      if (this.metadata == null) { this.metadata = this.packageManager.loadPackageMetadata(this.path) }
      if (this.bundledPackage == null) { this.bundledPackage = this.packageManager.isBundledPackagePath(this.path) }
      this.name = (left = (this.metadata != null ? this.metadata.name : undefined) != null ? (this.metadata != null ? this.metadata.name : undefined) : params.name) != null ? left : path.basename(this.path)
      this.reset()
    }

    /*
    Section: Event Subscription
    */

    // Essential: Invoke the given callback when all packages have been activated.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidDeactivate (callback) {
      return this.emitter.on('did-deactivate', callback)
    }

    /*
    Section: Instance Methods
    */

    enable () {
      return this.config.removeAtKeyPath('core.disabledPackages', this.name)
    }

    disable () {
      return this.config.pushAtKeyPath('core.disabledPackages', this.name)
    }

    isTheme () {
      return ((this.metadata != null ? this.metadata.theme : undefined) != null)
    }

    measure (key, fn) {
      const startTime = Date.now()
      const value = fn()
      this[key] = Date.now() - startTime
      return value
    }

    getType () { return 'atom' }

    getStyleSheetPriority () { return 0 }

    preload () {
      this.loadKeymaps()
      this.loadMenus()
      this.registerDeserializerMethods()
      this.activateCoreStartupServices()
      this.configSchemaRegisteredOnLoad = this.registerConfigSchemaFromMetadata()
      this.requireMainModule()
      this.settingsPromise = this.loadSettings()

      this.activationDisposables = new CompositeDisposable()
      this.activateKeymaps()
      this.activateMenus()
      for (let settings of Array.from(this.settings)) { settings.activate() }
      return this.settingsActivated = true
    }

    finishLoading () {
      return this.measure('loadTime', () => {
        this.path = path.join(this.packageManager.resourcePath, this.path)
        ModuleCache.add(this.path, this.metadata)

        this.loadStylesheets()
        // Unfortunately some packages are accessing `@mainModulePath`, so we need
        // to compute that variable eagerly also for preloaded packages.
        return this.getMainModulePath()
      })
    }

    load () {
      this.measure('loadTime', () => {
        try {
          ModuleCache.add(this.path, this.metadata)

          this.loadKeymaps()
          this.loadMenus()
          this.loadStylesheets()
          this.registerDeserializerMethods()
          this.activateCoreStartupServices()
          this.registerTranspilerConfig()
          this.configSchemaRegisteredOnLoad = this.registerConfigSchemaFromMetadata()
          this.settingsPromise = this.loadSettings()
          if (this.shouldRequireMainModuleOnLoad() && (this.mainModule == null)) {
            return this.requireMainModule()
          }
        } catch (error) {
          return this.handleError(`Failed to load the ${this.name} package`, error)
        }
      })
      return this
    }

    unload () {
      return this.unregisterTranspilerConfig()
    }

    shouldRequireMainModuleOnLoad () {
      return !(
        (this.metadata.deserializers != null) ||
        (this.metadata.viewProviders != null) ||
        (this.metadata.configSchema != null) ||
        this.activationShouldBeDeferred() ||
        (localStorage.getItem(this.getCanDeferMainModuleRequireStorageKey()) === 'true')
      )
    }

    reset () {
      this.stylesheets = []
      this.keymaps = []
      this.menus = []
      this.grammars = []
      this.settings = []
      this.mainInitialized = false
      return this.mainActivated = false
    }

    initializeIfNeeded () {
      if (this.mainInitialized) { return }
      this.measure('initializeTime', () => {
        try {
          // The main module's `initialize()` method is guaranteed to be called
          // before its `activate()`. This gives you a chance to handle the
          // serialized package state before the package's derserializers and view
          // providers are used.
          if (this.mainModule == null) { this.requireMainModule() }
          if (typeof this.mainModule.initialize === 'function') {
            let left
            this.mainModule.initialize((left = this.packageManager.getPackageState(this.name)) != null ? left : {})
          }
          return this.mainInitialized = true
        } catch (error) {
          return this.handleError(`Failed to initialize the ${this.name} package`, error)
        }
      })
    }

    activate () {
      if (this.grammarsPromise == null) { this.grammarsPromise = this.loadGrammars() }
      if (this.activationPromise == null) {
        this.activationPromise =
        new Promise((resolve, reject) => {
          this.resolveActivationPromise = resolve
          return this.measure('activateTime', () => {
            try {
              this.activateResources()
              if (this.activationShouldBeDeferred()) {
                return this.subscribeToDeferredActivation()
              } else {
                return this.activateNow()
              }
            } catch (error) {
              return this.handleError(`Failed to activate the ${this.name} package`, error)
            }
          })
        })
      }

      return Promise.all([this.grammarsPromise, this.settingsPromise, this.activationPromise])
    }

    activateNow () {
      try {
        if (this.mainModule == null) { this.requireMainModule() }
        this.configSchemaRegisteredOnActivate = this.registerConfigSchemaFromMainModule()
        this.registerViewProviders()
        this.activateStylesheets()
        if ((this.mainModule != null) && !this.mainActivated) {
          this.initializeIfNeeded()
          if (typeof this.mainModule.activateConfig === 'function') {
            this.mainModule.activateConfig()
          }
          if (typeof this.mainModule.activate === 'function') {
            let left
            this.mainModule.activate((left = this.packageManager.getPackageState(this.name)) != null ? left : {})
          }
          this.mainActivated = true
          this.activateServices()
        }
        if (this.activationCommandSubscriptions != null) {
          this.activationCommandSubscriptions.dispose()
        }
        if (this.activationHookSubscriptions != null) {
          this.activationHookSubscriptions.dispose()
        }
      } catch (error) {
        this.handleError(`Failed to activate the ${this.name} package`, error)
      }

      return (typeof this.resolveActivationPromise === 'function' ? this.resolveActivationPromise() : undefined)
    }

    registerConfigSchemaFromMetadata () {
      let configSchema
      if (configSchema = this.metadata.configSchema) {
        this.config.setSchema(this.name, { type: 'object', properties: configSchema })
        return true
      } else {
        return false
      }
    }

    registerConfigSchemaFromMainModule () {
      if ((this.mainModule != null) && !this.configSchemaRegisteredOnLoad) {
        if ((this.mainModule.config != null) && (typeof this.mainModule.config === 'object')) {
          this.config.setSchema(this.name, { type: 'object', properties: this.mainModule.config })
          return true
        }
      }
      return false
    }

    // TODO: Remove. Settings view calls this method currently.
    activateConfig () {
      if (this.configSchemaRegisteredOnLoad) { return }
      this.requireMainModule()
      return this.registerConfigSchemaFromMainModule()
    }

    activateStylesheets () {
      if (this.stylesheetsActivated) { return }

      this.stylesheetDisposables = new CompositeDisposable()

      const priority = this.getStyleSheetPriority()
      for (let [sourcePath, source] of Array.from(this.stylesheets)) {
        var context, match
        if ((match = path.basename(sourcePath).match(/[^.]*\.([^.]*)\./))) {
          context = match[1]
        } else if (this.metadata.theme === 'syntax') {
          context = 'atom-text-editor'
        } else {
          context = undefined
        }

        this.stylesheetDisposables.add(
          this.styleManager.addStyleSheet(
            source,
            {
              sourcePath,
              priority,
              context,
              skipDeprecatedSelectorsTransformation: this.bundledPackage
            }
          )
        )
      }
      return this.stylesheetsActivated = true
    }

    activateResources () {
      let left
      if (this.activationDisposables == null) { this.activationDisposables = new CompositeDisposable() }

      const keymapIsDisabled = _.include((left = this.config.get('core.packagesWithKeymapsDisabled')) != null ? left : [], this.name)
      if (keymapIsDisabled) {
        this.deactivateKeymaps()
      } else if (!this.keymapActivated) {
        this.activateKeymaps()
      }

      if (!this.menusActivated) {
        this.activateMenus()
      }

      if (!this.grammarsActivated) {
        for (let grammar of Array.from(this.grammars)) { grammar.activate() }
        this.grammarsActivated = true
      }

      if (!this.settingsActivated) {
        for (let settings of Array.from(this.settings)) { settings.activate() }
        return this.settingsActivated = true
      }
    }

    activateKeymaps () {
      if (this.keymapActivated) { return }

      this.keymapDisposables = new CompositeDisposable()

      const validateSelectors = !this.preloadedPackage
      for (let [keymapPath, map] of Array.from(this.keymaps)) { this.keymapDisposables.add(this.keymapManager.add(keymapPath, map, 0, validateSelectors)) }
      this.menuManager.update()

      return this.keymapActivated = true
    }

    deactivateKeymaps () {
      if (!this.keymapActivated) { return }

      if (this.keymapDisposables != null) {
        this.keymapDisposables.dispose()
      }
      this.menuManager.update()

      return this.keymapActivated = false
    }

    hasKeymaps () {
      let map
      for ([path, map] of Array.from(this.keymaps)) {
        if (map.length > 0) {
          return true
        }
      }
      return false
    }

    activateMenus () {
      let map, menuPath
      const validateSelectors = !this.preloadedPackage
      for ([menuPath, map] of Array.from(this.menus)) {
        if (map['context-menu'] != null) {
          try {
            const itemsBySelector = map['context-menu']
            this.activationDisposables.add(this.contextMenuManager.add(itemsBySelector, validateSelectors))
          } catch (error) {
            if (error.code === 'EBADSELECTOR') {
              error.message += ` in ${menuPath}`
              error.stack += `\n  at ${menuPath}:1:1`
            }
            throw error
          }
        }
      }

      for ([menuPath, map] of Array.from(this.menus)) {
        if (map['menu'] != null) {
          this.activationDisposables.add(this.menuManager.add(map['menu']))
        }
      }

      return this.menusActivated = true
    }

    activateServices () {
      let methodName, name, version, versions
      for (name in this.metadata.providedServices) {
        ({ versions } = this.metadata.providedServices[name])
        const servicesByVersion = {}
        for (version in versions) {
          methodName = versions[version]
          if (typeof this.mainModule[methodName] === 'function') {
            servicesByVersion[version] = this.mainModule[methodName]()
          }
        }
        this.activationDisposables.add(this.packageManager.serviceHub.provide(name, servicesByVersion))
      }

      for (name in this.metadata.consumedServices) {
        ({ versions } = this.metadata.consumedServices[name])
        for (version in versions) {
          methodName = versions[version]
          if (typeof this.mainModule[methodName] === 'function') {
            this.activationDisposables.add(this.packageManager.serviceHub.consume(name, version, this.mainModule[methodName].bind(this.mainModule)))
          }
        }
      }
    }

    registerTranspilerConfig () {
      if (this.metadata.atomTranspilers) {
        return CompileCache.addTranspilerConfigForPath(this.path, this.name, this.metadata, this.metadata.atomTranspilers)
      }
    }

    unregisterTranspilerConfig () {
      if (this.metadata.atomTranspilers) {
        return CompileCache.removeTranspilerConfigForPath(this.path)
      }
    }

    loadKeymaps () {
      let keymapPath
      if (this.bundledPackage && (this.packageManager.packagesCache[this.name] != null)) {
        this.keymaps = ((() => {
          const result = []
          for (keymapPath in this.packageManager.packagesCache[this.name].keymaps) {
            const keymapObject = this.packageManager.packagesCache[this.name].keymaps[keymapPath]
            result.push([`core:${keymapPath}`, keymapObject])
          }
          return result
        })())
      } else {
        this.keymaps = this.getKeymapPaths().map(function (keymapPath) {
          let left
          return [keymapPath, (left = CSON.readFileSync(keymapPath, { allowDuplicateKeys: false })) != null ? left : {}]
        })
      }
    }

    loadMenus () {
      let menuPath
      if (this.bundledPackage && (this.packageManager.packagesCache[this.name] != null)) {
        this.menus = ((() => {
          const result = []
          for (menuPath in this.packageManager.packagesCache[this.name].menus) {
            const menuObject = this.packageManager.packagesCache[this.name].menus[menuPath]
            result.push([`core:${menuPath}`, menuObject])
          }
          return result
        })())
      } else {
        this.menus = this.getMenuPaths().map(function (menuPath) {
          let left
          return [menuPath, (left = CSON.readFileSync(menuPath)) != null ? left : {}]
        })
      }
    }

    getKeymapPaths () {
      const keymapsDirPath = path.join(this.path, 'keymaps')
      if (this.metadata.keymaps) {
        return this.metadata.keymaps.map(name => fs.resolve(keymapsDirPath, name, ['json', 'cson', '']))
      } else {
        return fs.listSync(keymapsDirPath, ['cson', 'json'])
      }
    }

    getMenuPaths () {
      const menusDirPath = path.join(this.path, 'menus')
      if (this.metadata.menus) {
        return this.metadata.menus.map(name => fs.resolve(menusDirPath, name, ['json', 'cson', '']))
      } else {
        return fs.listSync(menusDirPath, ['cson', 'json'])
      }
    }

    loadStylesheets () {
      return this.stylesheets = this.getStylesheetPaths().map(stylesheetPath => {
        return [stylesheetPath, this.themeManager.loadStylesheet(stylesheetPath, true)]
      })
    }

    registerDeserializerMethods () {
      if (this.metadata.deserializers != null) {
        Object.keys(this.metadata.deserializers).forEach(deserializerName => {
          const methodName = this.metadata.deserializers[deserializerName]
          return this.deserializerManager.add({
            name: deserializerName,
            deserialize: (state, atomEnvironment) => {
              this.registerViewProviders()
              this.requireMainModule()
              this.initializeIfNeeded()
              return this.mainModule[methodName](state, atomEnvironment)
            }
          })
        })
      }
    }

    activateCoreStartupServices () {
      let directoryProviderService
      if (directoryProviderService = this.metadata.providedServices != null ? this.metadata.providedServices['atom.directory-provider'] : undefined) {
        this.requireMainModule()
        const servicesByVersion = {}
        for (let version in directoryProviderService.versions) {
          const methodName = directoryProviderService.versions[version]
          if (typeof this.mainModule[methodName] === 'function') {
            servicesByVersion[version] = this.mainModule[methodName]()
          }
        }
        return this.packageManager.serviceHub.provide('atom.directory-provider', servicesByVersion)
      }
    }

    registerViewProviders () {
      if ((this.metadata.viewProviders != null) && !this.registeredViewProviders) {
        this.requireMainModule()
        this.metadata.viewProviders.forEach(methodName => {
          return this.viewRegistry.addViewProvider(model => {
            this.initializeIfNeeded()
            return this.mainModule[methodName](model)
          })
        })
        return this.registeredViewProviders = true
      }
    }

    getStylesheetsPath () {
      return path.join(this.path, 'styles')
    }

    getStylesheetPaths () {
      if (this.bundledPackage && ((this.packageManager.packagesCache[this.name] != null ? this.packageManager.packagesCache[this.name].styleSheetPaths : undefined) != null)) {
        const { styleSheetPaths } = this.packageManager.packagesCache[this.name]
        return styleSheetPaths.map(styleSheetPath => path.join(this.path, styleSheetPath))
      } else {
        let indexStylesheet
        const stylesheetDirPath = this.getStylesheetsPath()
        if (this.metadata.mainStyleSheet) {
          return [fs.resolve(this.path, this.metadata.mainStyleSheet)]
        } else if (this.metadata.styleSheets) {
          return this.metadata.styleSheets.map(name => fs.resolve(stylesheetDirPath, name, ['css', 'less', '']))
        } else if ((indexStylesheet = fs.resolve(this.path, 'index', ['css', 'less']))) {
          return [indexStylesheet]
        } else {
          return fs.listSync(stylesheetDirPath, ['css', 'less'])
        }
      }
    }

    loadGrammarsSync () {
      let grammarPaths
      if (this.grammarsLoaded) { return }

      if (this.preloadedPackage && (this.packageManager.packagesCache[this.name] != null)) {
        ({ grammarPaths } = this.packageManager.packagesCache[this.name])
      } else {
        grammarPaths = fs.listSync(path.join(this.path, 'grammars'), ['json', 'cson'])
      }

      for (let grammarPath of Array.from(grammarPaths)) {
        if (this.preloadedPackage && (this.packageManager.packagesCache[this.name] != null)) {
          grammarPath = path.resolve(this.packageManager.resourcePath, grammarPath)
        }

        try {
          const grammar = this.grammarRegistry.readGrammarSync(grammarPath)
          grammar.packageName = this.name
          grammar.bundledPackage = this.bundledPackage
          this.grammars.push(grammar)
          grammar.activate()
        } catch (error) {
          console.warn(`Failed to load grammar: ${grammarPath}`, error.stack != null ? error.stack : error)
        }
      }

      this.grammarsLoaded = true
      return this.grammarsActivated = true
    }

    loadGrammars () {
      if (this.grammarsLoaded) { return Promise.resolve() }

      const loadGrammar = (grammarPath, callback) => {
        if (this.preloadedPackage) {
          grammarPath = path.resolve(this.packageManager.resourcePath, grammarPath)
        }

        return this.grammarRegistry.readGrammar(grammarPath, (error, grammar) => {
          if (error != null) {
            const detail = `${error.message} in ${grammarPath}`
            const stack = `${error.stack}\n  at ${grammarPath}:1:1`
            this.notificationManager.addFatalError(`Failed to load a ${this.name} package grammar`, { stack, detail, packageName: this.name, dismissable: true })
          } else {
            grammar.packageName = this.name
            grammar.bundledPackage = this.bundledPackage
            this.grammars.push(grammar)
            if (this.grammarsActivated) { grammar.activate() }
          }
          return callback()
        })
      }

      return new Promise(resolve => {
        if (this.preloadedPackage && (this.packageManager.packagesCache[this.name] != null)) {
          const { grammarPaths } = this.packageManager.packagesCache[this.name]
          return async.each(grammarPaths, loadGrammar, () => resolve())
        } else {
          const grammarsDirPath = path.join(this.path, 'grammars')
          return fs.exists(grammarsDirPath, function (grammarsDirExists) {
            if (!grammarsDirExists) { return resolve() }

            return fs.list(grammarsDirPath, ['json', 'cson'], function (error, grammarPaths) {
              if (grammarPaths == null) { grammarPaths = [] }
              return async.each(grammarPaths, loadGrammar, () => resolve())
            })
          })
        }
      })
    }

    loadSettings () {
      this.settings = []

      const loadSettingsFile = (settingsPath, callback) => {
        return ScopedProperties.load(settingsPath, this.config, (error, settings) => {
          if (error != null) {
            const detail = `${error.message} in ${settingsPath}`
            const stack = `${error.stack}\n  at ${settingsPath}:1:1`
            this.notificationManager.addFatalError(`Failed to load the ${this.name} package settings`, { stack, detail, packageName: this.name, dismissable: true })
          } else {
            this.settings.push(settings)
            if (this.settingsActivated) { settings.activate() }
          }
          return callback()
        })
      }

      return new Promise(resolve => {
        if (this.preloadedPackage && (this.packageManager.packagesCache[this.name] != null)) {
          for (let settingsPath in this.packageManager.packagesCache[this.name].settings) {
            const scopedProperties = this.packageManager.packagesCache[this.name].settings[settingsPath]
            const settings = new ScopedProperties(`core:${settingsPath}`, scopedProperties != null ? scopedProperties : {}, this.config)
            this.settings.push(settings)
            if (this.settingsActivated) { settings.activate() }
          }
          return resolve()
        } else {
          const settingsDirPath = path.join(this.path, 'settings')
          return fs.exists(settingsDirPath, function (settingsDirExists) {
            if (!settingsDirExists) { return resolve() }

            return fs.list(settingsDirPath, ['json', 'cson'], function (error, settingsPaths) {
              if (settingsPaths == null) { settingsPaths = [] }
              return async.each(settingsPaths, loadSettingsFile, () => resolve())
            })
          })
        }
      })
    }

    serialize () {
      if (this.mainActivated) {
        try {
          return __guardMethod__(this.mainModule, 'serialize', o => o.serialize())
        } catch (e) {
          return console.error(`Error serializing package '${this.name}'`, e.stack)
        }
      }
    }

    deactivate () {
      this.activationPromise = null
      this.resolveActivationPromise = null
      if (this.activationCommandSubscriptions != null) {
        this.activationCommandSubscriptions.dispose()
      }
      if (this.activationHookSubscriptions != null) {
        this.activationHookSubscriptions.dispose()
      }
      this.configSchemaRegisteredOnActivate = false
      this.deactivateResources()
      this.deactivateKeymaps()
      if (this.mainActivated) {
        try {
          __guardMethod__(this.mainModule, 'deactivate', o => o.deactivate())
          __guardMethod__(this.mainModule, 'deactivateConfig', o1 => o1.deactivateConfig())
          this.mainActivated = false
          this.mainInitialized = false
        } catch (e) {
          console.error(`Error deactivating package '${this.name}'`, e.stack)
        }
      }
      return this.emitter.emit('did-deactivate')
    }

    deactivateResources () {
      for (let grammar of Array.from(this.grammars)) { grammar.deactivate() }
      for (let settings of Array.from(this.settings)) { settings.deactivate() }
      if (this.stylesheetDisposables != null) {
        this.stylesheetDisposables.dispose()
      }
      if (this.activationDisposables != null) {
        this.activationDisposables.dispose()
      }
      if (this.keymapDisposables != null) {
        this.keymapDisposables.dispose()
      }
      this.stylesheetsActivated = false
      this.grammarsActivated = false
      this.settingsActivated = false
      return this.menusActivated = false
    }

    reloadStylesheets () {
      try {
        this.loadStylesheets()
      } catch (error) {
        this.handleError(`Failed to reload the ${this.name} package stylesheets`, error)
      }

      if (this.stylesheetDisposables != null) {
        this.stylesheetDisposables.dispose()
      }
      this.stylesheetDisposables = new CompositeDisposable()
      this.stylesheetsActivated = false
      return this.activateStylesheets()
    }

    requireMainModule () {
      if (this.bundledPackage && (this.packageManager.packagesCache[this.name] != null)) {
        if (this.packageManager.packagesCache[this.name].main != null) {
          return this.mainModule = require(this.packageManager.packagesCache[this.name].main)
        }
      } else if (this.mainModuleRequired) {
        return this.mainModule
      } else if (!this.isCompatible()) {
        console.warn(`\
Failed to require the main module of '${this.name}' because it requires one or more incompatible native modules (${_.pluck(this.incompatibleModules, 'name').join(', ')}).
Run \`apm rebuild\` in the package directory and restart Atom to resolve.\
`
        )
      } else {
        const mainModulePath = this.getMainModulePath()
        if (fs.isFileSync(mainModulePath)) {
          this.mainModuleRequired = true

          const previousViewProviderCount = this.viewRegistry.getViewProviderCount()
          const previousDeserializerCount = this.deserializerManager.getDeserializerCount()
          this.mainModule = require(mainModulePath)
          if ((this.viewRegistry.getViewProviderCount() === previousViewProviderCount) &&
              (this.deserializerManager.getDeserializerCount() === previousDeserializerCount)) {
            return localStorage.setItem(this.getCanDeferMainModuleRequireStorageKey(), 'true')
          }
        }
      }
    }

    getMainModulePath () {
      if (this.resolvedMainModulePath) { return this.mainModulePath }
      this.resolvedMainModulePath = true

      if (this.bundledPackage && (this.packageManager.packagesCache[this.name] != null)) {
        if (this.packageManager.packagesCache[this.name].main) {
          return this.mainModulePath = path.resolve(this.packageManager.resourcePath, 'static', this.packageManager.packagesCache[this.name].main)
        } else {
          return this.mainModulePath = null
        }
      } else {
        const mainModulePath =
          this.metadata.main
            ? path.join(this.path, this.metadata.main)
            : path.join(this.path, 'index')
        return this.mainModulePath = fs.resolveExtension(mainModulePath, ['', ...Array.from(CompileCache.supportedExtensions)])
      }
    }

    activationShouldBeDeferred () {
      return this.hasActivationCommands() || this.hasActivationHooks()
    }

    hasActivationHooks () {
      return __guard__(this.getActivationHooks(), x => x.length) > 0
    }

    hasActivationCommands () {
      const object = this.getActivationCommands()
      for (let selector in object) {
        const commands = object[selector]
        if (commands.length > 0) { return true }
      }
      return false
    }

    subscribeToDeferredActivation () {
      this.subscribeToActivationCommands()
      return this.subscribeToActivationHooks()
    }

    subscribeToActivationCommands () {
      this.activationCommandSubscriptions = new CompositeDisposable()
      const object = this.getActivationCommands()
      for (let selector in object) {
        const commands = object[selector]
        for (let command of Array.from(commands)) {
          ((selector, command) => {
            // Add dummy command so it appears in menu.
            // The real command will be registered on package activation
            try {
              this.activationCommandSubscriptions.add(this.commandRegistry.add(selector, command, function () {}))
            } catch (error) {
              if (error.code === 'EBADSELECTOR') {
                const metadataPath = path.join(this.path, 'package.json')
                error.message += ` in ${metadataPath}`
                error.stack += `\n  at ${metadataPath}:1:1`
              }
              throw error
            }

            return this.activationCommandSubscriptions.add(this.commandRegistry.onWillDispatch(event => {
              if (event.type !== command) { return }
              let currentTarget = event.target
              while (currentTarget) {
                if (currentTarget.webkitMatchesSelector(selector)) {
                  this.activationCommandSubscriptions.dispose()
                  this.activateNow()
                  break
                }
                currentTarget = currentTarget.parentElement
              }
            })
            )
          })(selector, command)
        }
      }
    }

    getActivationCommands () {
      if (this.activationCommands != null) { return this.activationCommands }

      this.activationCommands = {}

      if (this.metadata.activationCommands != null) {
        for (let selector in this.metadata.activationCommands) {
          const commands = this.metadata.activationCommands[selector]
          if (this.activationCommands[selector] == null) { this.activationCommands[selector] = [] }
          if (_.isString(commands)) {
            this.activationCommands[selector].push(commands)
          } else if (_.isArray(commands)) {
            this.activationCommands[selector].push(...Array.from(commands || []))
          }
        }
      }

      return this.activationCommands
    }

    subscribeToActivationHooks () {
      this.activationHookSubscriptions = new CompositeDisposable()
      for (let hook of Array.from(this.getActivationHooks())) {
        (hook => {
          if ((hook != null) && _.isString(hook) && (hook.trim().length > 0)) { return this.activationHookSubscriptions.add(this.packageManager.onDidTriggerActivationHook(hook, () => this.activateNow())) }
        })(hook)
      }
    }

    getActivationHooks () {
      if ((this.metadata != null) && (this.activationHooks != null)) { return this.activationHooks }

      this.activationHooks = []

      if (this.metadata.activationHooks != null) {
        if (_.isArray(this.metadata.activationHooks)) {
          this.activationHooks.push(...Array.from(this.metadata.activationHooks || []))
        } else if (_.isString(this.metadata.activationHooks)) {
          this.activationHooks.push(this.metadata.activationHooks)
        }
      }

      return this.activationHooks = _.uniq(this.activationHooks)
    }

    // Does the given module path contain native code?
    isNativeModule (modulePath) {
      try {
        return fs.listSync(path.join(modulePath, 'build', 'Release'), ['.node']).length > 0
      } catch (error) {
        return false
      }
    }

    // Get an array of all the native modules that this package depends on.
    //
    // First try to get this information from
    // @metadata._atomModuleCache.extensions. If @metadata._atomModuleCache doesn't
    // exist, recurse through all dependencies.
    getNativeModuleDependencyPaths () {
      const nativeModulePaths = []

      if (this.metadata._atomModuleCache != null) {
        const relativeNativeModuleBindingPaths = (this.metadata._atomModuleCache.extensions != null ? this.metadata._atomModuleCache.extensions['.node'] : undefined) != null ? (this.metadata._atomModuleCache.extensions != null ? this.metadata._atomModuleCache.extensions['.node'] : undefined) : []
        for (let relativeNativeModuleBindingPath of Array.from(relativeNativeModuleBindingPaths)) {
          const nativeModulePath = path.join(this.path, relativeNativeModuleBindingPath, '..', '..', '..')
          nativeModulePaths.push(nativeModulePath)
        }
        return nativeModulePaths
      }

      var traversePath = nodeModulesPath => {
        try {
          for (let modulePath of Array.from(fs.listSync(nodeModulesPath))) {
            if (this.isNativeModule(modulePath)) { nativeModulePaths.push(modulePath) }
            traversePath(path.join(modulePath, 'node_modules'))
          }
        } catch (error) {}
      }

      traversePath(path.join(this.path, 'node_modules'))
      return nativeModulePaths
    }

    /*
    Section: Native Module Compatibility
    */

    // Extended: Are all native modules depended on by this package correctly
    // compiled against the current version of Atom?
    //
    // Incompatible packages cannot be activated.
    //
    // Returns a {Boolean}, true if compatible, false if incompatible.
    isCompatible () {
      if (this.compatible != null) { return this.compatible }

      if (this.preloadedPackage) {
        // Preloaded packages are always considered compatible
        return this.compatible = true
      } else if (this.getMainModulePath()) {
        this.incompatibleModules = this.getIncompatibleNativeModules()
        return this.compatible = (this.incompatibleModules.length === 0) && (this.getBuildFailureOutput() == null)
      } else {
        return this.compatible = true
      }
    }

    // Extended: Rebuild native modules in this package's dependencies for the
    // current version of Atom.
    //
    // Returns a {Promise} that resolves with an object containing `code`,
    // `stdout`, and `stderr` properties based on the results of running
    // `apm rebuild` on the package.
    rebuild () {
      return new Promise(resolve => {
        return this.runRebuildProcess(result => {
          if (result.code === 0) {
            global.localStorage.removeItem(this.getBuildFailureOutputStorageKey())
          } else {
            this.compatible = false
            global.localStorage.setItem(this.getBuildFailureOutputStorageKey(), result.stderr)
          }
          global.localStorage.setItem(this.getIncompatibleNativeModulesStorageKey(), '[]')
          return resolve(result)
        })
      })
    }

    // Extended: If a previous rebuild failed, get the contents of stderr.
    //
    // Returns a {String} or null if no previous build failure occurred.
    getBuildFailureOutput () {
      return global.localStorage.getItem(this.getBuildFailureOutputStorageKey())
    }

    runRebuildProcess (callback) {
      let stderr = ''
      let stdout = ''
      return new BufferedProcess({
        command: this.packageManager.getApmPath(),
        args: ['rebuild', '--no-color'],
        options: { cwd: this.path },
        stderr (output) { return stderr += output },
        stdout (output) { return stdout += output },
        exit (code) { return callback({ code, stdout, stderr }) }
      })
    }

    getBuildFailureOutputStorageKey () {
      return `installed-packages:${this.name}:${this.metadata.version}:build-error`
    }

    getIncompatibleNativeModulesStorageKey () {
      const electronVersion = process.versions.electron
      return `installed-packages:${this.name}:${this.metadata.version}:electron-${electronVersion}:incompatible-native-modules`
    }

    getCanDeferMainModuleRequireStorageKey () {
      return `installed-packages:${this.name}:${this.metadata.version}:can-defer-main-module-require`
    }

    // Get the incompatible native modules that this package depends on.
    // This recurses through all dependencies and requires all modules that
    // contain a `.node` file.
    //
    // This information is cached in local storage on a per package/version basis
    // to minimize the impact on startup time.
    getIncompatibleNativeModules () {
      if (!this.packageManager.devMode) {
        try {
          let arrayAsString
          if (arrayAsString = global.localStorage.getItem(this.getIncompatibleNativeModulesStorageKey())) {
            return JSON.parse(arrayAsString)
          }
        } catch (error1) {}
      }

      const incompatibleNativeModules = []
      for (let nativeModulePath of Array.from(this.getNativeModuleDependencyPaths())) {
        var version
        try {
          require(nativeModulePath)
        } catch (error) {
          try {
            ({ version } = require(`${nativeModulePath}/package.json`))
          } catch (error2) {}
          incompatibleNativeModules.push({
            path: nativeModulePath,
            name: path.basename(nativeModulePath),
            version,
            error: error.message
          })
        }
      }

      global.localStorage.setItem(this.getIncompatibleNativeModulesStorageKey(), JSON.stringify(incompatibleNativeModules))
      return incompatibleNativeModules
    }

    handleError (message, error) {
      let detail, location, stack
      if (atom.inSpecMode()) {
        throw error
      }

      if (error.filename && error.location && (error instanceof SyntaxError)) {
        location = `${error.filename}:${error.location.first_line + 1}:${error.location.first_column + 1}`
        detail = `${error.message} in ${location}`
        stack = `\
SyntaxError: ${error.message}
  at ${location}\
`
      } else if (error.less && error.filename && (error.column != null) && (error.line != null)) {
        // Less errors
        location = `${error.filename}:${error.line}:${error.column}`
        detail = `${error.message} in ${location}`
        stack = `\
LessError: ${error.message}
  at ${location}\
`
      } else {
        detail = error.message
        stack = error.stack != null ? error.stack : error
      }

      return this.notificationManager.addFatalError(message, { stack, detail, packageName: this.name, dismissable: true })
    }
  }
  Package.initClass()
  return Package
})())

function __guardMethod__ (obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName)
  } else {
    return undefined
  }
}
function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
