/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const KeymapManager = require('atom-keymap')
const TextEditor = require('../src/text-editor')
const WindowEventHandler = require('../src/window-event-handler')
const { ipcRenderer } = require('electron')

describe('WindowEventHandler', function () {
  let [windowEventHandler] = Array.from([])

  beforeEach(function () {
    atom.uninstallWindowEventHandler()
    spyOn(atom, 'hide')
    const initialPath = atom.project.getPaths()[0]
    spyOn(atom, 'getLoadSettings').andCallFake(function () {
      const loadSettings = atom.getLoadSettings.originalValue.call(atom)
      loadSettings.initialPath = initialPath
      return loadSettings
    })
    atom.project.destroy()
    windowEventHandler = new WindowEventHandler({ atomEnvironment: atom, applicationDelegate: atom.applicationDelegate })
    return windowEventHandler.initialize(window, document)
  })

  afterEach(function () {
    windowEventHandler.unsubscribe()
    return atom.installWindowEventHandler()
  })

  describe('when the window is loaded', () =>
    it("doesn't have .is-blurred on the body tag", function () {
      if (process.platform === 'win32') { return } // Win32TestFailures - can not steal focus
      return expect(document.body.className).not.toMatch('is-blurred')
    })
  )

  describe('when the window is blurred', function () {
    beforeEach(() => window.dispatchEvent(new CustomEvent('blur')))

    afterEach(() => document.body.classList.remove('is-blurred'))

    it('adds the .is-blurred class on the body', () => expect(document.body.className).toMatch('is-blurred'))

    return describe('when the window is focused again', () =>
      it('removes the .is-blurred class from the body', function () {
        window.dispatchEvent(new CustomEvent('focus'))
        return expect(document.body.className).not.toMatch('is-blurred')
      })
    )
  })

  describe('window:close event', () =>
    it('closes the window', function () {
      spyOn(atom, 'close')
      window.dispatchEvent(new CustomEvent('window:close'))
      return expect(atom.close).toHaveBeenCalled()
    })
  )

  describe('when a link is clicked', () =>
    it('opens the http/https links in an external application', function () {
      const { shell } = require('electron')
      spyOn(shell, 'openExternal')

      const link = document.createElement('a')
      const linkChild = document.createElement('span')
      link.appendChild(linkChild)
      link.href = 'http://github.com'
      jasmine.attachToDOM(link)
      const fakeEvent = { target: linkChild, currentTarget: link, preventDefault () {} }

      windowEventHandler.handleLinkClick(fakeEvent)
      expect(shell.openExternal).toHaveBeenCalled()
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com')
      shell.openExternal.reset()

      link.href = 'https://github.com'
      windowEventHandler.handleLinkClick(fakeEvent)
      expect(shell.openExternal).toHaveBeenCalled()
      expect(shell.openExternal.argsForCall[0][0]).toBe('https://github.com')
      shell.openExternal.reset()

      link.href = ''
      windowEventHandler.handleLinkClick(fakeEvent)
      expect(shell.openExternal).not.toHaveBeenCalled()
      shell.openExternal.reset()

      link.href = '#scroll-me'
      windowEventHandler.handleLinkClick(fakeEvent)
      return expect(shell.openExternal).not.toHaveBeenCalled()
    })
  )

  describe('when a form is submitted', () =>
    it("prevents the default so that the window's URL isn't changed", function () {
      const form = document.createElement('form')
      jasmine.attachToDOM(form)

      let defaultPrevented = false
      const event = new CustomEvent('submit', { bubbles: true })
      event.preventDefault = () => defaultPrevented = true
      form.dispatchEvent(event)
      return expect(defaultPrevented).toBe(true)
    })
  )

  describe('core:focus-next and core:focus-previous', function () {
    describe('when there is no currently focused element', () =>
      it('focuses the element with the lowest/highest tabindex', function () {
        const wrapperDiv = document.createElement('div')
        wrapperDiv.innerHTML = `\
<div>
  <button tabindex="2"></button>
  <input tabindex="1">
</div>\
`
        const elements = wrapperDiv.firstChild
        jasmine.attachToDOM(elements)

        elements.dispatchEvent(new CustomEvent('core:focus-next', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(1)

        document.body.focus()
        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        return expect(document.activeElement.tabIndex).toBe(2)
      })
    )

    return describe('when a tabindex is set on the currently focused element', () =>
      it('focuses the element with the next highest/lowest tabindex, skipping disabled elements', function () {
        const wrapperDiv = document.createElement('div')
        wrapperDiv.innerHTML = `\
<div>
  <input tabindex="1">
  <button tabindex="2"></button>
  <button tabindex="5"></button>
  <input tabindex="-1">
  <input tabindex="3">
  <button tabindex="7"></button>
  <input tabindex="9" disabled>
</div>\
`
        const elements = wrapperDiv.firstChild
        jasmine.attachToDOM(elements)

        elements.querySelector('[tabindex="1"]').focus()

        elements.dispatchEvent(new CustomEvent('core:focus-next', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(2)

        elements.dispatchEvent(new CustomEvent('core:focus-next', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(3)

        elements.dispatchEvent(new CustomEvent('core:focus-next', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(5)

        elements.dispatchEvent(new CustomEvent('core:focus-next', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(7)

        elements.dispatchEvent(new CustomEvent('core:focus-next', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(1)

        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(7)

        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(5)

        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(3)

        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(2)

        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        expect(document.activeElement.tabIndex).toBe(1)

        elements.dispatchEvent(new CustomEvent('core:focus-previous', { bubbles: true }))
        return expect(document.activeElement.tabIndex).toBe(7)
      })
    )
  })

  describe('when keydown events occur on the document', () =>
    it('dispatches the event via the KeymapManager and CommandRegistry', function () {
      const dispatchedCommands = []
      atom.commands.onWillDispatch(command => dispatchedCommands.push(command))
      atom.commands.add('*', { 'foo-command' () {} })
      atom.keymaps.add('source-name', { '*': { 'x': 'foo-command' } })

      const event = KeymapManager.buildKeydownEvent('x', { target: document.createElement('div') })
      document.dispatchEvent(event)

      expect(dispatchedCommands.length).toBe(1)
      return expect(dispatchedCommands[0].type).toBe('foo-command')
    })
  )

  return describe('native key bindings', () =>
    it("correctly dispatches them to active elements with the '.native-key-bindings' class", function () {
      const webContentsSpy = jasmine.createSpyObj('webContents', ['copy', 'paste'])
      spyOn(atom.applicationDelegate, 'getCurrentWindow').andReturn({
        webContents: webContentsSpy,
        on () {}
      })

      const nativeKeyBindingsInput = document.createElement('input')
      nativeKeyBindingsInput.classList.add('native-key-bindings')
      jasmine.attachToDOM(nativeKeyBindingsInput)
      nativeKeyBindingsInput.focus()

      atom.dispatchApplicationMenuCommand('core:copy')
      atom.dispatchApplicationMenuCommand('core:paste')

      expect(webContentsSpy.copy).toHaveBeenCalled()
      expect(webContentsSpy.paste).toHaveBeenCalled()

      webContentsSpy.copy.reset()
      webContentsSpy.paste.reset()

      const normalInput = document.createElement('input')
      jasmine.attachToDOM(normalInput)
      normalInput.focus()

      atom.dispatchApplicationMenuCommand('core:copy')
      atom.dispatchApplicationMenuCommand('core:paste')

      expect(webContentsSpy.copy).not.toHaveBeenCalled()
      return expect(webContentsSpy.paste).not.toHaveBeenCalled()
    })
  )
})
