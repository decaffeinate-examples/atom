/** @babel */
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ItemRegistry
module.exports =
(ItemRegistry = class ItemRegistry {
  constructor () {
    this.items = new WeakSet()
  }

  addItem (item) {
    if (this.hasItem(item)) {
      throw new Error(`The workspace can only contain one instance of item ${item}`)
    }
    return this.items.add(item)
  }

  removeItem (item) {
    return this.items.delete(item)
  }

  hasItem (item) {
    return this.items.has(item)
  }
})
