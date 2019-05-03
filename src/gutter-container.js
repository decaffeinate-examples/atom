/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let GutterContainer;
const {Emitter} = require('event-kit');
const Gutter = require('./gutter');

module.exports =
(GutterContainer = class GutterContainer {
  constructor(textEditor) {
    this.gutters = [];
    this.textEditor = textEditor;
    this.emitter = new Emitter;
  }

  scheduleComponentUpdate() {
    return this.textEditor.scheduleComponentUpdate();
  }

  destroy() {
    // Create a copy, because `Gutter::destroy` removes the gutter from
    // GutterContainer's @gutters.
    const guttersToDestroy = this.gutters.slice(0);
    for (let gutter of Array.from(guttersToDestroy)) {
      if (gutter.name !== 'line-number') { gutter.destroy(); }
    }
    this.gutters = [];
    return this.emitter.dispose();
  }

  addGutter(options) {
    options = options != null ? options : {};
    const gutterName = options.name;
    if (gutterName === null) {
      throw new Error('A name is required to create a gutter.');
    }
    if (this.gutterWithName(gutterName)) {
      throw new Error('Tried to create a gutter with a name that is already in use.');
    }
    const newGutter = new Gutter(this, options);

    let inserted = false;
    // Insert the gutter into the gutters array, sorted in ascending order by 'priority'.
    // This could be optimized, but there are unlikely to be many gutters.
    for (let i = 0, end = this.gutters.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      if (this.gutters[i].priority >= newGutter.priority) {
        this.gutters.splice(i, 0, newGutter);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.gutters.push(newGutter);
    }
    this.scheduleComponentUpdate();
    this.emitter.emit('did-add-gutter', newGutter);
    return newGutter;
  }

  getGutters() {
    return this.gutters.slice();
  }

  gutterWithName(name) {
    for (let gutter of Array.from(this.gutters)) {
      if (gutter.name === name) { return gutter; }
    }
    return null;
  }

  observeGutters(callback) {
    for (let gutter of Array.from(this.getGutters())) { callback(gutter); }
    return this.onDidAddGutter(callback);
  }

  onDidAddGutter(callback) {
    return this.emitter.on('did-add-gutter', callback);
  }

  onDidRemoveGutter(callback) {
    return this.emitter.on('did-remove-gutter', callback);
  }

  /*
  Section: Private Methods
  */

  // Processes the destruction of the gutter. Throws an error if this gutter is
  // not within this gutterContainer.
  removeGutter(gutter) {
    const index = this.gutters.indexOf(gutter);
    if (index > -1) {
      this.gutters.splice(index, 1);
      this.scheduleComponentUpdate();
      return this.emitter.emit('did-remove-gutter', gutter.name);
    } else {
      throw new Error('The given gutter cannot be removed because it is not ' +
          'within this GutterContainer.'
      );
    }
  }

  // The public interface is Gutter::decorateMarker or TextEditor::decorateMarker.
  addGutterDecoration(gutter, marker, options) {
    if (gutter.name === 'line-number') {
      options.type = 'line-number';
    } else {
      options.type = 'gutter';
    }
    options.gutterName = gutter.name;
    return this.textEditor.decorateMarker(marker, options);
  }
});
