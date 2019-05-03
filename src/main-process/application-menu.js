/** @babel */
/* eslint-disable
    no-cond-assign,
    no-return-assign,
    no-unused-vars,
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
let ApplicationMenu
const { app, Menu } = require('electron')
const _ = require('underscore-plus')

// Used to manage the global application menu.
//
// It's created by {AtomApplication} upon instantiation and used to add, remove
// and maintain the state of all menu items.
module.exports =
(ApplicationMenu = class ApplicationMenu {
  constructor (version, autoUpdateManager) {
    this.version = version
    this.autoUpdateManager = autoUpdateManager
    this.windowTemplates = new WeakMap()
    this.setActiveTemplate(this.getDefaultTemplate())
    this.autoUpdateManager.on('state-changed', state => this.showUpdateMenuItem(state))
  }

  // Public: Updates the entire menu with the given keybindings.
  //
  // window - The BrowserWindow this menu template is associated with.
  // template - The Object which describes the menu to display.
  // keystrokesByCommand - An Object where the keys are commands and the values
  //                       are Arrays containing the keystroke.
  update (window, template, keystrokesByCommand) {
    this.translateTemplate(template, keystrokesByCommand)
    this.substituteVersion(template)
    this.windowTemplates.set(window, template)
    if (window === this.lastFocusedWindow) { return this.setActiveTemplate(template) }
  }

  setActiveTemplate (template) {
    if (!_.isEqual(template, this.activeTemplate)) {
      this.activeTemplate = template
      this.menu = Menu.buildFromTemplate(_.deepClone(template))
      Menu.setApplicationMenu(this.menu)
    }

    return this.showUpdateMenuItem(this.autoUpdateManager.getState())
  }

  // Register a BrowserWindow with this application menu.
  addWindow (window) {
    if (this.lastFocusedWindow == null) { this.lastFocusedWindow = window }

    const focusHandler = () => {
      let template
      this.lastFocusedWindow = window
      if (template = this.windowTemplates.get(window)) {
        return this.setActiveTemplate(template)
      }
    }

    window.on('focus', focusHandler)
    window.once('closed', () => {
      if (window === this.lastFocusedWindow) { this.lastFocusedWindow = null }
      this.windowTemplates.delete(window)
      return window.removeListener('focus', focusHandler)
    })

    return this.enableWindowSpecificItems(true)
  }

  // Flattens the given menu and submenu items into an single Array.
  //
  // menu - A complete menu configuration object for atom-shell's menu API.
  //
  // Returns an Array of native menu items.
  flattenMenuItems (menu) {
    let items = []
    const object = menu.items || {}
    for (let index in object) {
      const item = object[index]
      items.push(item)
      if (item.submenu) { items = items.concat(this.flattenMenuItems(item.submenu)) }
    }
    return items
  }

  // Flattens the given menu template into an single Array.
  //
  // template - An object describing the menu item.
  //
  // Returns an Array of native menu items.
  flattenMenuTemplate (template) {
    let items = []
    for (let item of Array.from(template)) {
      items.push(item)
      if (item.submenu) { items = items.concat(this.flattenMenuTemplate(item.submenu)) }
    }
    return items
  }

  // Public: Used to make all window related menu items are active.
  //
  // enable - If true enables all window specific items, if false disables all
  //          window specific items.
  enableWindowSpecificItems (enable) {
    for (let item of Array.from(this.flattenMenuItems(this.menu))) {
      if (item.metadata != null ? item.metadata.windowSpecific : undefined) { item.enabled = enable }
    }
  }

  // Replaces VERSION with the current version.
  substituteVersion (template) {
    let item
    if (item = _.find(this.flattenMenuTemplate(template), ({ label }) => label === 'VERSION')) {
      return item.label = `Version ${this.version}`
    }
  }

  // Sets the proper visible state the update menu items
  showUpdateMenuItem (state) {
    const checkForUpdateItem = _.find(this.flattenMenuItems(this.menu), ({ label }) => label === 'Check for Update')
    const checkingForUpdateItem = _.find(this.flattenMenuItems(this.menu), ({ label }) => label === 'Checking for Update')
    const downloadingUpdateItem = _.find(this.flattenMenuItems(this.menu), ({ label }) => label === 'Downloading Update')
    const installUpdateItem = _.find(this.flattenMenuItems(this.menu), ({ label }) => label === 'Restart and Install Update')

    if ((checkForUpdateItem == null) || (checkingForUpdateItem == null) || (downloadingUpdateItem == null) || (installUpdateItem == null)) { return }

    checkForUpdateItem.visible = false
    checkingForUpdateItem.visible = false
    downloadingUpdateItem.visible = false
    installUpdateItem.visible = false

    switch (state) {
      case 'idle': case 'error': case 'no-update-available':
        return checkForUpdateItem.visible = true
      case 'checking':
        return checkingForUpdateItem.visible = true
      case 'downloading':
        return downloadingUpdateItem.visible = true
      case 'update-available':
        return installUpdateItem.visible = true
    }
  }

  // Default list of menu items.
  //
  // Returns an Array of menu item Objects.
  getDefaultTemplate () {
    return [{
      label: 'Atom',
      submenu: [
        { label: 'Check for Update', metadata: { autoUpdate: true } },
        { label: 'Reload', accelerator: 'Command+R', click: () => __guard__(this.focusedWindow(), x => x.reload()) },
        { label: 'Close Window', accelerator: 'Command+Shift+W', click: () => __guard__(this.focusedWindow(), x => x.close()) },
        { label: 'Toggle Dev Tools', accelerator: 'Command+Alt+I', click: () => __guard__(this.focusedWindow(), x => x.toggleDevTools()) },
        { label: 'Quit', accelerator: 'Command+Q', click () { return app.quit() } }
      ]
    }
    ]
  }

  focusedWindow () {
    return _.find(global.atomApplication.windows, atomWindow => atomWindow.isFocused())
  }

  // Combines a menu template with the appropriate keystroke.
  //
  // template - An Object conforming to atom-shell's menu api but lacking
  //            accelerator and click properties.
  // keystrokesByCommand - An Object where the keys are commands and the values
  //                       are Arrays containing the keystroke.
  //
  // Returns a complete menu configuration object for atom-shell's menu API.
  translateTemplate (template, keystrokesByCommand) {
    template.forEach(item => {
      if (item.metadata == null) { item.metadata = {} }
      if (item.command) {
        item.accelerator = this.acceleratorForCommand(item.command, keystrokesByCommand)
        item.click = () => global.atomApplication.sendCommand(item.command, item.commandDetail)
        if (!/^application:/.test(item.command, item.commandDetail)) { item.metadata.windowSpecific = true }
      }
      if (item.submenu) { return this.translateTemplate(item.submenu, keystrokesByCommand) }
    })
    return template
  }

  // Determine the accelerator for a given command.
  //
  // command - The name of the command.
  // keystrokesByCommand - An Object where the keys are commands and the values
  //                       are Arrays containing the keystroke.
  //
  // Returns a String containing the keystroke in a format that can be interpreted
  //   by atom shell to provide nice icons where available.
  acceleratorForCommand (command, keystrokesByCommand) {
    const firstKeystroke = keystrokesByCommand[command] != null ? keystrokesByCommand[command][0] : undefined
    if (!firstKeystroke) { return null }

    let modifiers = firstKeystroke.split(/-(?=.)/)
    const key = modifiers.pop().toUpperCase().replace('+', 'Plus')

    modifiers = modifiers.map(modifier =>
      modifier.replace(/shift/ig, 'Shift')
        .replace(/cmd/ig, 'Command')
        .replace(/ctrl/ig, 'Ctrl')
        .replace(/alt/ig, 'Alt')
    )

    const keys = modifiers.concat([key])
    return keys.join('+')
  }
})

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
