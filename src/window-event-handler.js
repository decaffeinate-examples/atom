/** @babel */
/* eslint-disable
    no-return-assign,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let WindowEventHandler
const { Disposable, CompositeDisposable } = require('event-kit')
const listen = require('./delegated-listener')

// Handles low-level events related to the @window.
module.exports =
(WindowEventHandler = class WindowEventHandler {
  constructor ({ atomEnvironment, applicationDelegate }) {
    this.handleDocumentKeyEvent = this.handleDocumentKeyEvent.bind(this)
    this.handleFocusNext = this.handleFocusNext.bind(this)
    this.handleFocusPrevious = this.handleFocusPrevious.bind(this)
    this.handleWindowBlur = this.handleWindowBlur.bind(this)
    this.handleEnterFullScreen = this.handleEnterFullScreen.bind(this)
    this.handleLeaveFullScreen = this.handleLeaveFullScreen.bind(this)
    this.handleWindowBeforeunload = this.handleWindowBeforeunload.bind(this)
    this.handleWindowToggleFullScreen = this.handleWindowToggleFullScreen.bind(this)
    this.handleWindowClose = this.handleWindowClose.bind(this)
    this.handleWindowReload = this.handleWindowReload.bind(this)
    this.handleWindowToggleDevTools = this.handleWindowToggleDevTools.bind(this)
    this.handleWindowToggleMenuBar = this.handleWindowToggleMenuBar.bind(this)
    this.handleLinkClick = this.handleLinkClick.bind(this)
    this.handleDocumentContextmenu = this.handleDocumentContextmenu.bind(this)
    this.atomEnvironment = atomEnvironment
    this.applicationDelegate = applicationDelegate
    this.reloadRequested = false
    this.subscriptions = new CompositeDisposable()

    this.handleNativeKeybindings()
  }

  initialize (window, document) {
    this.window = window
    this.document = document
    this.subscriptions.add(this.atomEnvironment.commands.add(this.window, {
      'window:toggle-full-screen': this.handleWindowToggleFullScreen,
      'window:close': this.handleWindowClose,
      'window:reload': this.handleWindowReload,
      'window:toggle-dev-tools': this.handleWindowToggleDevTools
    }
    )
    )

    if (['win32', 'linux'].includes(process.platform)) {
      this.subscriptions.add(this.atomEnvironment.commands.add(this.window,
        { 'window:toggle-menu-bar': this.handleWindowToggleMenuBar })
      )
    }

    this.subscriptions.add(this.atomEnvironment.commands.add(this.document, {
      'core:focus-next': this.handleFocusNext,
      'core:focus-previous': this.handleFocusPrevious
    }
    )
    )

    this.addEventListener(this.window, 'beforeunload', this.handleWindowBeforeunload)
    this.addEventListener(this.window, 'focus', this.handleWindowFocus)
    this.addEventListener(this.window, 'blur', this.handleWindowBlur)

    this.addEventListener(this.document, 'keyup', this.handleDocumentKeyEvent)
    this.addEventListener(this.document, 'keydown', this.handleDocumentKeyEvent)
    this.addEventListener(this.document, 'drop', this.handleDocumentDrop)
    this.addEventListener(this.document, 'dragover', this.handleDocumentDragover)
    this.addEventListener(this.document, 'contextmenu', this.handleDocumentContextmenu)
    this.subscriptions.add(listen(this.document, 'click', 'a', this.handleLinkClick))
    this.subscriptions.add(listen(this.document, 'submit', 'form', this.handleFormSubmit))

    this.subscriptions.add(this.applicationDelegate.onDidEnterFullScreen(this.handleEnterFullScreen))
    return this.subscriptions.add(this.applicationDelegate.onDidLeaveFullScreen(this.handleLeaveFullScreen))
  }

  // Wire commands that should be handled by Chromium for elements with the
  // `.native-key-bindings` class.
  handleNativeKeybindings () {
    const bindCommandToAction = (command, action) => {
      return this.subscriptions.add(this.atomEnvironment.commands.add(
        '.native-key-bindings',
        command,
        event => this.applicationDelegate.getCurrentWindow().webContents[action](),
        false
      )
      )
    }

    bindCommandToAction('core:copy', 'copy')
    bindCommandToAction('core:paste', 'paste')
    bindCommandToAction('core:undo', 'undo')
    bindCommandToAction('core:redo', 'redo')
    bindCommandToAction('core:select-all', 'selectAll')
    return bindCommandToAction('core:cut', 'cut')
  }

  unsubscribe () {
    return this.subscriptions.dispose()
  }

  on (target, eventName, handler) {
    target.on(eventName, handler)
    return this.subscriptions.add(new Disposable(function () {
      return target.removeListener(eventName, handler)
    }))
  }

  addEventListener (target, eventName, handler) {
    target.addEventListener(eventName, handler)
    return this.subscriptions.add(new Disposable(function () { return target.removeEventListener(eventName, handler) }))
  }

  handleDocumentKeyEvent (event) {
    this.atomEnvironment.keymaps.handleKeyboardEvent(event)
    return event.stopImmediatePropagation()
  }

  handleDrop (event) {
    event.preventDefault()
    return event.stopPropagation()
  }

  handleDragover (event) {
    event.preventDefault()
    event.stopPropagation()
    return event.dataTransfer.dropEffect = 'none'
  }

  eachTabIndexedElement (callback) {
    for (let element of Array.from(this.document.querySelectorAll('[tabindex]'))) {
      if (element.disabled) { continue }
      if (!(element.tabIndex >= 0)) { continue }
      callback(element, element.tabIndex)
    }
  }

  handleFocusNext () {
    const focusedTabIndex = this.document.activeElement.tabIndex != null ? this.document.activeElement.tabIndex : -Infinity

    let nextElement = null
    let nextTabIndex = Infinity
    let lowestElement = null
    let lowestTabIndex = Infinity
    this.eachTabIndexedElement(function (element, tabIndex) {
      if (tabIndex < lowestTabIndex) {
        lowestTabIndex = tabIndex
        lowestElement = element
      }

      if (focusedTabIndex < tabIndex && tabIndex < nextTabIndex) {
        nextTabIndex = tabIndex
        return nextElement = element
      }
    })

    if (nextElement != null) {
      return nextElement.focus()
    } else if (lowestElement != null) {
      return lowestElement.focus()
    }
  }

  handleFocusPrevious () {
    const focusedTabIndex = this.document.activeElement.tabIndex != null ? this.document.activeElement.tabIndex : Infinity

    let previousElement = null
    let previousTabIndex = -Infinity
    let highestElement = null
    let highestTabIndex = -Infinity
    this.eachTabIndexedElement(function (element, tabIndex) {
      if (tabIndex > highestTabIndex) {
        highestTabIndex = tabIndex
        highestElement = element
      }

      if (focusedTabIndex > tabIndex && tabIndex > previousTabIndex) {
        previousTabIndex = tabIndex
        return previousElement = element
      }
    })

    if (previousElement != null) {
      return previousElement.focus()
    } else if (highestElement != null) {
      return highestElement.focus()
    }
  }

  handleWindowFocus () {
    return this.document.body.classList.remove('is-blurred')
  }

  handleWindowBlur () {
    this.document.body.classList.add('is-blurred')
    return this.atomEnvironment.storeWindowDimensions()
  }

  handleEnterFullScreen () {
    return this.document.body.classList.add('fullscreen')
  }

  handleLeaveFullScreen () {
    return this.document.body.classList.remove('fullscreen')
  }

  handleWindowBeforeunload (event) {
    if (!this.reloadRequested && !this.atomEnvironment.inSpecMode() && this.atomEnvironment.getCurrentWindow().isWebViewFocused()) {
      this.atomEnvironment.hide()
    }
    this.reloadRequested = false
    this.atomEnvironment.storeWindowDimensions()
    this.atomEnvironment.unloadEditorWindow()
    return this.atomEnvironment.destroy()
  }

  handleWindowToggleFullScreen () {
    return this.atomEnvironment.toggleFullScreen()
  }

  handleWindowClose () {
    return this.atomEnvironment.close()
  }

  handleWindowReload () {
    this.reloadRequested = true
    return this.atomEnvironment.reload()
  }

  handleWindowToggleDevTools () {
    return this.atomEnvironment.toggleDevTools()
  }

  handleWindowToggleMenuBar () {
    this.atomEnvironment.config.set('core.autoHideMenuBar', !this.atomEnvironment.config.get('core.autoHideMenuBar'))

    if (this.atomEnvironment.config.get('core.autoHideMenuBar')) {
      const detail = 'To toggle, press the Alt key or execute the window:toggle-menu-bar command'
      return this.atomEnvironment.notifications.addInfo('Menu bar hidden', { detail })
    }
  }

  handleLinkClick (event) {
    event.preventDefault()
    const uri = event.currentTarget != null ? event.currentTarget.getAttribute('href') : undefined
    if (uri && (uri[0] !== '#') && /^https?:\/\//.test(uri)) {
      return this.applicationDelegate.openExternal(uri)
    }
  }

  handleFormSubmit (event) {
    // Prevent form submits from changing the current window's URL
    return event.preventDefault()
  }

  handleDocumentContextmenu (event) {
    event.preventDefault()
    return this.atomEnvironment.contextMenu.showForEvent(event)
  }
})
