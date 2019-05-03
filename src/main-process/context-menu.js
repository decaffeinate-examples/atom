/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ContextMenu;
const {Menu} = require('electron');

module.exports =
(ContextMenu = class ContextMenu {
  constructor(template, atomWindow) {
    this.atomWindow = atomWindow;
    template = this.createClickHandlers(template);
    const menu = Menu.buildFromTemplate(template);
    menu.popup(this.atomWindow.browserWindow);
  }

  // It's necessary to build the event handlers in this process, otherwise
  // closures are dragged across processes and failed to be garbage collected
  // appropriately.
  createClickHandlers(template) {
    return (() => {
      const result = [];
      for (let item of Array.from(template)) {
        if (item.command) {
          if (item.commandDetail == null) { item.commandDetail = {}; }
          item.commandDetail.contextCommand = true;
          item.commandDetail.atomWindow = this.atomWindow;
          (item => {
            return item.click = () => {
              return global.atomApplication.sendCommandToWindow(item.command, this.atomWindow, item.commandDetail);
            };
          })(item);
        } else if (item.submenu) {
          this.createClickHandlers(item.submenu);
        }
        result.push(item);
      }
      return result;
    })();
  }
});
