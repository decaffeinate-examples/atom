/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path')
const Package = require('../src/package')
const ThemePackage = require('../src/theme-package')
const { mockLocalStorage } = require('./spec-helper')

describe('Package', function () {
  const build = (constructor, path) =>
    new constructor({
      path,
      packageManager: atom.packages,
      config: atom.config,
      styleManager: atom.styles,
      notificationManager: atom.notifications,
      keymapManager: atom.keymaps,
      commandRegistry: atom.command,
      grammarRegistry: atom.grammars,
      themeManager: atom.themes,
      menuManager: atom.menu,
      contextMenuManager: atom.contextMenu,
      deserializerManager: atom.deserializers,
      viewRegistry: atom.views
    })

  const buildPackage = packagePath => build(Package, packagePath)

  const buildThemePackage = themePath => build(ThemePackage, themePath)

  describe('when the package contains incompatible native modules', function () {
    beforeEach(function () {
      atom.packages.devMode = false
      return mockLocalStorage()
    })

    afterEach(() => atom.packages.devMode = true)

    it('does not activate it', function () {
      const packagePath = atom.project.getDirectories()[0].resolve('packages/package-with-incompatible-native-module')
      const pack = buildPackage(packagePath)
      expect(pack.isCompatible()).toBe(false)
      expect(pack.incompatibleModules[0].name).toBe('native-module')
      return expect(pack.incompatibleModules[0].path).toBe(path.join(packagePath, 'node_modules', 'native-module'))
    })

    it("utilizes _atomModuleCache if present to determine the package's native dependencies", function () {
      let packagePath = atom.project.getDirectories()[0].resolve('packages/package-with-ignored-incompatible-native-module')
      let pack = buildPackage(packagePath)
      expect(pack.getNativeModuleDependencyPaths().length).toBe(1) // doesn't see the incompatible module
      expect(pack.isCompatible()).toBe(true)

      packagePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/package-with-cached-incompatible-native-module'))
      pack = buildPackage(packagePath)
      return expect(pack.isCompatible()).toBe(false)
    })

    it('caches the incompatible native modules in local storage', function () {
      const packagePath = atom.project.getDirectories()[0].resolve('packages/package-with-incompatible-native-module')
      expect(buildPackage(packagePath).isCompatible()).toBe(false)
      expect(global.localStorage.getItem.callCount).toBe(1)
      expect(global.localStorage.setItem.callCount).toBe(1)

      expect(buildPackage(packagePath).isCompatible()).toBe(false)
      expect(global.localStorage.getItem.callCount).toBe(2)
      return expect(global.localStorage.setItem.callCount).toBe(1)
    })

    return it('logs an error to the console describing the problem', function () {
      const packagePath = atom.project.getDirectories()[0].resolve('packages/package-with-incompatible-native-module')

      spyOn(console, 'warn')
      spyOn(atom.notifications, 'addFatalError')

      buildPackage(packagePath).activateNow()

      expect(atom.notifications.addFatalError).not.toHaveBeenCalled()
      expect(console.warn.callCount).toBe(1)
      return expect(console.warn.mostRecentCall.args[0]).toContain('it requires one or more incompatible native modules (native-module)')
    })
  })

  describe('::rebuild()', function () {
    beforeEach(function () {
      atom.packages.devMode = false
      return mockLocalStorage()
    })

    afterEach(() => atom.packages.devMode = true)

    it('returns a promise resolving to the results of `apm rebuild`', function () {
      const packagePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/package-with-index'))
      const pack = buildPackage(packagePath)
      const rebuildCallbacks = []
      spyOn(pack, 'runRebuildProcess').andCallFake(callback => rebuildCallbacks.push(callback))

      const promise = pack.rebuild()
      rebuildCallbacks[0]({ code: 0, stdout: 'stdout output', stderr: 'stderr output' })

      return waitsFor(done =>
        promise.then(function (result) {
          expect(result).toEqual({ code: 0, stdout: 'stdout output', stderr: 'stderr output' })
          return done()
        })
      )
    })

    it('persists build failures in local storage', function () {
      const packagePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/package-with-index'))
      const pack = buildPackage(packagePath)

      expect(pack.isCompatible()).toBe(true)
      expect(pack.getBuildFailureOutput()).toBeNull()

      const rebuildCallbacks = []
      spyOn(pack, 'runRebuildProcess').andCallFake(callback => rebuildCallbacks.push(callback))

      pack.rebuild()
      rebuildCallbacks[0]({ code: 13, stderr: 'It is broken' })

      expect(pack.getBuildFailureOutput()).toBe('It is broken')
      expect(pack.getIncompatibleNativeModules()).toEqual([])
      expect(pack.isCompatible()).toBe(false)

      // A different package instance has the same failure output (simulates reload)
      const pack2 = buildPackage(packagePath)
      expect(pack2.getBuildFailureOutput()).toBe('It is broken')
      expect(pack2.isCompatible()).toBe(false)

      // Clears the build failure after a successful build
      pack.rebuild()
      rebuildCallbacks[1]({ code: 0, stdout: 'It worked' })

      expect(pack.getBuildFailureOutput()).toBeNull()
      return expect(pack2.getBuildFailureOutput()).toBeNull()
    })

    return it('sets cached incompatible modules to an empty array when the rebuild completes (there may be a build error, but rebuilding *deletes* native modules)', function () {
      const packagePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/package-with-incompatible-native-module'))
      const pack = buildPackage(packagePath)

      expect(pack.getIncompatibleNativeModules().length).toBeGreaterThan(0)

      const rebuildCallbacks = []
      spyOn(pack, 'runRebuildProcess').andCallFake(callback => rebuildCallbacks.push(callback))

      pack.rebuild()
      expect(pack.getIncompatibleNativeModules().length).toBeGreaterThan(0)
      rebuildCallbacks[0]({ code: 0, stdout: 'It worked' })
      return expect(pack.getIncompatibleNativeModules().length).toBe(0)
    })
  })

  describe('theme', function () {
    let [editorElement, theme] = Array.from([])

    beforeEach(function () {
      editorElement = document.createElement('atom-text-editor')
      return jasmine.attachToDOM(editorElement)
    })

    afterEach(function () {
      if (theme != null) { return theme.deactivate() }
    })

    describe('when the theme contains a single style file', function () {
      it('loads and applies css', function () {
        expect(getComputedStyle(editorElement).paddingBottom).not.toBe('1234px')
        const themePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/theme-with-index-css'))
        theme = buildThemePackage(themePath)
        theme.activate()
        return expect(getComputedStyle(editorElement).paddingTop).toBe('1234px')
      })

      return it('parses, loads and applies less', function () {
        expect(getComputedStyle(editorElement).paddingBottom).not.toBe('1234px')
        const themePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/theme-with-index-less'))
        theme = buildThemePackage(themePath)
        theme.activate()
        return expect(getComputedStyle(editorElement).paddingTop).toBe('4321px')
      })
    })

    describe('when the theme contains a package.json file', () =>
      it('loads and applies stylesheets from package.json in the correct order', function () {
        expect(getComputedStyle(editorElement).paddingTop).not.toBe('101px')
        expect(getComputedStyle(editorElement).paddingRight).not.toBe('102px')
        expect(getComputedStyle(editorElement).paddingBottom).not.toBe('103px')

        const themePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/theme-with-package-file'))
        theme = buildThemePackage(themePath)
        theme.activate()
        expect(getComputedStyle(editorElement).paddingTop).toBe('101px')
        expect(getComputedStyle(editorElement).paddingRight).toBe('102px')
        return expect(getComputedStyle(editorElement).paddingBottom).toBe('103px')
      })
    )

    describe('when the theme does not contain a package.json file and is a directory', () =>
      it('loads all stylesheet files in the directory', function () {
        expect(getComputedStyle(editorElement).paddingTop).not.toBe('10px')
        expect(getComputedStyle(editorElement).paddingRight).not.toBe('20px')
        expect(getComputedStyle(editorElement).paddingBottom).not.toBe('30px')

        const themePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/theme-without-package-file'))
        theme = buildThemePackage(themePath)
        theme.activate()
        expect(getComputedStyle(editorElement).paddingTop).toBe('10px')
        expect(getComputedStyle(editorElement).paddingRight).toBe('20px')
        return expect(getComputedStyle(editorElement).paddingBottom).toBe('30px')
      })
    )

    describe('reloading a theme', function () {
      beforeEach(function () {
        const themePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/theme-with-package-file'))
        theme = buildThemePackage(themePath)
        return theme.activate()
      })

      return it('reloads without readding to the stylesheets list', function () {
        expect(theme.getStylesheetPaths().length).toBe(3)
        theme.reloadStylesheets()
        return expect(theme.getStylesheetPaths().length).toBe(3)
      })
    })

    return describe('events', function () {
      beforeEach(function () {
        const themePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/theme-with-package-file'))
        theme = buildThemePackage(themePath)
        return theme.activate()
      })

      return it('deactivated event fires on .deactivate()', function () {
        let spy
        theme.onDidDeactivate(spy = jasmine.createSpy())
        theme.deactivate()
        return expect(spy).toHaveBeenCalled()
      })
    })
  })

  describe('.loadMetadata()', function () {
    let [packagePath, metadata] = Array.from([])

    beforeEach(function () {
      packagePath = __guard__(atom.project.getDirectories()[0], x => x.resolve('packages/package-with-different-directory-name'))
      return metadata = atom.packages.loadPackageMetadata(packagePath, true)
    })

    return it('uses the package name defined in package.json', () => expect(metadata.name).toBe('package-with-a-totally-different-name'))
  })

  return describe('the initialize() hook', function () {
    it('gets called when the package is activated', function () {
      const packagePath = atom.project.getDirectories()[0].resolve('packages/package-with-deserializers')
      const pack = buildPackage(packagePath)
      pack.requireMainModule()
      const { mainModule } = pack
      spyOn(mainModule, 'initialize')
      expect(mainModule.initialize).not.toHaveBeenCalled()
      pack.activate()
      expect(mainModule.initialize).toHaveBeenCalled()
      return expect(mainModule.initialize.callCount).toBe(1)
    })

    return it('gets called when a deserializer is used', function () {
      const packagePath = atom.project.getDirectories()[0].resolve('packages/package-with-deserializers')
      const pack = buildPackage(packagePath)
      pack.requireMainModule()
      const { mainModule } = pack
      spyOn(mainModule, 'initialize')
      pack.load()
      expect(mainModule.initialize).not.toHaveBeenCalled()
      atom.deserializers.deserialize({ deserializer: 'Deserializer1', a: 'b' })
      return expect(mainModule.initialize).toHaveBeenCalled()
    })
  })
})

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
