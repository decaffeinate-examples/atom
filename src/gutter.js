/** @babel */
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Gutter
const { Emitter } = require('event-kit')
const CustomGutterComponent = null

const DefaultPriority = -100

// Extended: Represents a gutter within a {TextEditor}.
//
// See {TextEditor::addGutter} for information on creating a gutter.
module.exports =
(Gutter = class Gutter {
  constructor (gutterContainer, options) {
    this.gutterContainer = gutterContainer
    this.name = options != null ? options.name : undefined
    this.priority = (options != null ? options.priority : undefined) != null ? (options != null ? options.priority : undefined) : DefaultPriority
    this.visible = (options != null ? options.visible : undefined) != null ? (options != null ? options.visible : undefined) : true

    this.emitter = new Emitter()
  }

  /*
  Section: Gutter Destruction
  */

  // Essential: Destroys the gutter.
  destroy () {
    if (this.name === 'line-number') {
      throw new Error('The line-number gutter cannot be destroyed.')
    } else {
      this.gutterContainer.removeGutter(this)
      this.emitter.emit('did-destroy')
      return this.emitter.dispose()
    }
  }

  /*
  Section: Event Subscription
  */

  // Essential: Calls your `callback` when the gutter's visibility changes.
  //
  // * `callback` {Function}
  //  * `gutter` The gutter whose visibility changed.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChangeVisible (callback) {
    return this.emitter.on('did-change-visible', callback)
  }

  // Essential: Calls your `callback` when the gutter is destroyed.
  //
  // * `callback` {Function}
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidDestroy (callback) {
    return this.emitter.once('did-destroy', callback)
  }

  /*
  Section: Visibility
  */

  // Essential: Hide the gutter.
  hide () {
    if (this.visible) {
      this.visible = false
      this.gutterContainer.scheduleComponentUpdate()
      return this.emitter.emit('did-change-visible', this)
    }
  }

  // Essential: Show the gutter.
  show () {
    if (!this.visible) {
      this.visible = true
      this.gutterContainer.scheduleComponentUpdate()
      return this.emitter.emit('did-change-visible', this)
    }
  }

  // Essential: Determine whether the gutter is visible.
  //
  // Returns a {Boolean}.
  isVisible () {
    return this.visible
  }

  // Essential: Add a decoration that tracks a {DisplayMarker}. When the marker moves,
  // is invalidated, or is destroyed, the decoration will be updated to reflect
  // the marker's state.
  //
  // ## Arguments
  //
  // * `marker` A {DisplayMarker} you want this decoration to follow.
  // * `decorationParams` An {Object} representing the decoration. It is passed
  //   to {TextEditor::decorateMarker} as its `decorationParams` and so supports
  //   all options documented there.
  //   * `type` __Caveat__: set to `'line-number'` if this is the line-number
  //     gutter, `'gutter'` otherwise. This cannot be overridden.
  //
  // Returns a {Decoration} object
  decorateMarker (marker, options) {
    return this.gutterContainer.addGutterDecoration(this, marker, options)
  }

  getElement () {
    return this.element != null ? this.element : (this.element = document.createElement('div'))
  }
})
