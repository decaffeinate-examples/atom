/** @babel */
/* eslint-disable
    constructor-super,
    no-cond-assign,
    no-constant-condition,
    no-eval,
    no-return-assign,
    no-this-before-super,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Cursor
const { Point, Range } = require('text-buffer')
const { Emitter } = require('event-kit')
const _ = require('underscore-plus')
const Model = require('./model')

const EmptyLineRegExp = /(\r\n[\t ]*\r\n)|(\n[\t ]*\n)/g

// Extended: The `Cursor` class represents the little blinking line identifying
// where text can be inserted.
//
// Cursors belong to {TextEditor}s and have some metadata attached in the form
// of a {DisplayMarker}.
module.exports =
(Cursor = (function () {
  Cursor = class Cursor extends Model {
    static initClass () {
      this.prototype.screenPosition = null
      this.prototype.bufferPosition = null
      this.prototype.goalColumn = null
    }

    // Instantiated by a {TextEditor}
    constructor ({ editor, marker, id }) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super() }
        let thisFn = (() => { return this }).toString()
        let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1]
        eval(`${thisName} = this;`)
      }
      this.editor = editor
      this.marker = marker
      this.emitter = new Emitter()
      this.assignId(id)
    }

    destroy () {
      return this.marker.destroy()
    }

    /*
    Section: Event Subscription
    */

    // Public: Calls your `callback` when the cursor has been moved.
    //
    // * `callback` {Function}
    //   * `event` {Object}
    //     * `oldBufferPosition` {Point}
    //     * `oldScreenPosition` {Point}
    //     * `newBufferPosition` {Point}
    //     * `newScreenPosition` {Point}
    //     * `textChanged` {Boolean}
    //     * `Cursor` {Cursor} that triggered the event
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangePosition (callback) {
      return this.emitter.on('did-change-position', callback)
    }

    // Public: Calls your `callback` when the cursor is destroyed
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidDestroy (callback) {
      return this.emitter.once('did-destroy', callback)
    }

    /*
    Section: Managing Cursor Position
    */

    // Public: Moves a cursor to a given screen position.
    //
    // * `screenPosition` {Array} of two numbers: the screen row, and the screen column.
    // * `options` (optional) {Object} with the following keys:
    //   * `autoscroll` A Boolean which, if `true`, scrolls the {TextEditor} to wherever
    //     the cursor moves to.
    setScreenPosition (screenPosition, options) {
      if (options == null) { options = {} }
      return this.changePosition(options, () => {
        return this.marker.setHeadScreenPosition(screenPosition, options)
      })
    }

    // Public: Returns the screen position of the cursor as a {Point}.
    getScreenPosition () {
      return this.marker.getHeadScreenPosition()
    }

    // Public: Moves a cursor to a given buffer position.
    //
    // * `bufferPosition` {Array} of two numbers: the buffer row, and the buffer column.
    // * `options` (optional) {Object} with the following keys:
    //   * `autoscroll` {Boolean} indicating whether to autoscroll to the new
    //     position. Defaults to `true` if this is the most recently added cursor,
    //     `false` otherwise.
    setBufferPosition (bufferPosition, options) {
      if (options == null) { options = {} }
      return this.changePosition(options, () => {
        return this.marker.setHeadBufferPosition(bufferPosition, options)
      })
    }

    // Public: Returns the current buffer position as an Array.
    getBufferPosition () {
      return this.marker.getHeadBufferPosition()
    }

    // Public: Returns the cursor's current screen row.
    getScreenRow () {
      return this.getScreenPosition().row
    }

    // Public: Returns the cursor's current screen column.
    getScreenColumn () {
      return this.getScreenPosition().column
    }

    // Public: Retrieves the cursor's current buffer row.
    getBufferRow () {
      return this.getBufferPosition().row
    }

    // Public: Returns the cursor's current buffer column.
    getBufferColumn () {
      return this.getBufferPosition().column
    }

    // Public: Returns the cursor's current buffer row of text excluding its line
    // ending.
    getCurrentBufferLine () {
      return this.editor.lineTextForBufferRow(this.getBufferRow())
    }

    // Public: Returns whether the cursor is at the start of a line.
    isAtBeginningOfLine () {
      return this.getBufferPosition().column === 0
    }

    // Public: Returns whether the cursor is on the line return character.
    isAtEndOfLine () {
      return this.getBufferPosition().isEqual(this.getCurrentLineBufferRange().end)
    }

    /*
    Section: Cursor Position Details
    */

    // Public: Returns the underlying {DisplayMarker} for the cursor.
    // Useful with overlay {Decoration}s.
    getMarker () { return this.marker }

    // Public: Identifies if the cursor is surrounded by whitespace.
    //
    // "Surrounded" here means that the character directly before and after the
    // cursor are both whitespace.
    //
    // Returns a {Boolean}.
    isSurroundedByWhitespace () {
      const { row, column } = this.getBufferPosition()
      const range = [[row, column - 1], [row, column + 1]]
      return /^\s+$/.test(this.editor.getTextInBufferRange(range))
    }

    // Public: Returns whether the cursor is currently between a word and non-word
    // character. The non-word characters are defined by the
    // `editor.nonWordCharacters` config value.
    //
    // This method returns false if the character before or after the cursor is
    // whitespace.
    //
    // Returns a Boolean.
    isBetweenWordAndNonWord () {
      if (this.isAtBeginningOfLine() || this.isAtEndOfLine()) { return false }

      const { row, column } = this.getBufferPosition()
      const range = [[row, column - 1], [row, column + 1]]
      const [before, after] = Array.from(this.editor.getTextInBufferRange(range))
      if (/\s/.test(before) || /\s/.test(after)) { return false }

      const nonWordCharacters = this.getNonWordCharacters()
      return nonWordCharacters.includes(before) !== nonWordCharacters.includes(after)
    }

    // Public: Returns whether this cursor is between a word's start and end.
    //
    // * `options` (optional) {Object}
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //     (default: {::wordRegExp}).
    //
    // Returns a {Boolean}
    isInsideWord (options) {
      const { row, column } = this.getBufferPosition()
      const range = [[row, column], [row, Infinity]]
      return this.editor.getTextInBufferRange(range).search((options != null ? options.wordRegex : undefined) != null ? (options != null ? options.wordRegex : undefined) : this.wordRegExp()) === 0
    }

    // Public: Returns the indentation level of the current line.
    getIndentLevel () {
      if (this.editor.getSoftTabs()) {
        return this.getBufferColumn() / this.editor.getTabLength()
      } else {
        return this.getBufferColumn()
      }
    }

    // Public: Retrieves the scope descriptor for the cursor's current position.
    //
    // Returns a {ScopeDescriptor}
    getScopeDescriptor () {
      return this.editor.scopeDescriptorForBufferPosition(this.getBufferPosition())
    }

    // Public: Returns true if this cursor has no non-whitespace characters before
    // its current position.
    hasPrecedingCharactersOnLine () {
      const bufferPosition = this.getBufferPosition()
      const line = this.editor.lineTextForBufferRow(bufferPosition.row)
      const firstCharacterColumn = line.search(/\S/)

      if (firstCharacterColumn === -1) {
        return false
      } else {
        return bufferPosition.column > firstCharacterColumn
      }
    }

    // Public: Identifies if this cursor is the last in the {TextEditor}.
    //
    // "Last" is defined as the most recently added cursor.
    //
    // Returns a {Boolean}.
    isLastCursor () {
      return this === this.editor.getLastCursor()
    }

    /*
    Section: Moving the Cursor
    */

    // Public: Moves the cursor up one screen row.
    //
    // * `rowCount` (optional) {Number} number of rows to move (default: 1)
    // * `options` (optional) {Object} with the following keys:
    //   * `moveToEndOfSelection` if true, move to the left of the selection if a
    //     selection exists.
    moveUp (rowCount, param) {
      let column, row
      if (rowCount == null) { rowCount = 1 }
      if (param == null) { param = {} }
      const { moveToEndOfSelection } = param
      const range = this.marker.getScreenRange()
      if (moveToEndOfSelection && !range.isEmpty()) {
        ({ row, column } = range.start)
      } else {
        ({ row, column } = this.getScreenPosition())
      }

      if (this.goalColumn != null) { column = this.goalColumn }
      this.setScreenPosition({ row: row - rowCount, column }, { skipSoftWrapIndentation: true })
      return this.goalColumn = column
    }

    // Public: Moves the cursor down one screen row.
    //
    // * `rowCount` (optional) {Number} number of rows to move (default: 1)
    // * `options` (optional) {Object} with the following keys:
    //   * `moveToEndOfSelection` if true, move to the left of the selection if a
    //     selection exists.
    moveDown (rowCount, param) {
      let column, row
      if (rowCount == null) { rowCount = 1 }
      if (param == null) { param = {} }
      const { moveToEndOfSelection } = param
      const range = this.marker.getScreenRange()
      if (moveToEndOfSelection && !range.isEmpty()) {
        ({ row, column } = range.end)
      } else {
        ({ row, column } = this.getScreenPosition())
      }

      if (this.goalColumn != null) { column = this.goalColumn }
      this.setScreenPosition({ row: row + rowCount, column }, { skipSoftWrapIndentation: true })
      return this.goalColumn = column
    }

    // Public: Moves the cursor left one screen column.
    //
    // * `columnCount` (optional) {Number} number of columns to move (default: 1)
    // * `options` (optional) {Object} with the following keys:
    //   * `moveToEndOfSelection` if true, move to the left of the selection if a
    //     selection exists.
    moveLeft (columnCount, param) {
      if (columnCount == null) { columnCount = 1 }
      if (param == null) { param = {} }
      const { moveToEndOfSelection } = param
      const range = this.marker.getScreenRange()
      if (moveToEndOfSelection && !range.isEmpty()) {
        return this.setScreenPosition(range.start)
      } else {
        let { row, column } = this.getScreenPosition()

        while ((columnCount > column) && (row > 0)) {
          columnCount -= column
          column = this.editor.lineLengthForScreenRow(--row)
          columnCount--
        } // subtract 1 for the row move

        column = column - columnCount
        return this.setScreenPosition({ row, column }, { clipDirection: 'backward' })
      }
    }

    // Public: Moves the cursor right one screen column.
    //
    // * `columnCount` (optional) {Number} number of columns to move (default: 1)
    // * `options` (optional) {Object} with the following keys:
    //   * `moveToEndOfSelection` if true, move to the right of the selection if a
    //     selection exists.
    moveRight (columnCount, param) {
      if (columnCount == null) { columnCount = 1 }
      if (param == null) { param = {} }
      const { moveToEndOfSelection } = param
      const range = this.marker.getScreenRange()
      if (moveToEndOfSelection && !range.isEmpty()) {
        return this.setScreenPosition(range.end)
      } else {
        let { row, column } = this.getScreenPosition()
        const maxLines = this.editor.getScreenLineCount()
        let rowLength = this.editor.lineLengthForScreenRow(row)
        let columnsRemainingInLine = rowLength - column

        while ((columnCount > columnsRemainingInLine) && (row < (maxLines - 1))) {
          columnCount -= columnsRemainingInLine
          columnCount-- // subtract 1 for the row move

          column = 0
          rowLength = this.editor.lineLengthForScreenRow(++row)
          columnsRemainingInLine = rowLength
        }

        column = column + columnCount
        return this.setScreenPosition({ row, column }, { clipDirection: 'forward' })
      }
    }

    // Public: Moves the cursor to the top of the buffer.
    moveToTop () {
      return this.setBufferPosition([0, 0])
    }

    // Public: Moves the cursor to the bottom of the buffer.
    moveToBottom () {
      return this.setBufferPosition(this.editor.getEofBufferPosition())
    }

    // Public: Moves the cursor to the beginning of the line.
    moveToBeginningOfScreenLine () {
      return this.setScreenPosition([this.getScreenRow(), 0])
    }

    // Public: Moves the cursor to the beginning of the buffer line.
    moveToBeginningOfLine () {
      return this.setBufferPosition([this.getBufferRow(), 0])
    }

    // Public: Moves the cursor to the beginning of the first character in the
    // line.
    moveToFirstCharacterOfLine () {
      let targetBufferColumn
      const screenRow = this.getScreenRow()
      const screenLineStart = this.editor.clipScreenPosition([screenRow, 0], { skipSoftWrapIndentation: true })
      const screenLineEnd = [screenRow, Infinity]
      const screenLineBufferRange = this.editor.bufferRangeForScreenRange([screenLineStart, screenLineEnd])

      let firstCharacterColumn = null
      this.editor.scanInBufferRange(/\S/, screenLineBufferRange, function ({ range, stop }) {
        firstCharacterColumn = range.start.column
        return stop()
      })

      if ((firstCharacterColumn != null) && (firstCharacterColumn !== this.getBufferColumn())) {
        targetBufferColumn = firstCharacterColumn
      } else {
        targetBufferColumn = screenLineBufferRange.start.column
      }

      return this.setBufferPosition([screenLineBufferRange.start.row, targetBufferColumn])
    }

    // Public: Moves the cursor to the end of the line.
    moveToEndOfScreenLine () {
      return this.setScreenPosition([this.getScreenRow(), Infinity])
    }

    // Public: Moves the cursor to the end of the buffer line.
    moveToEndOfLine () {
      return this.setBufferPosition([this.getBufferRow(), Infinity])
    }

    // Public: Moves the cursor to the beginning of the word.
    moveToBeginningOfWord () {
      return this.setBufferPosition(this.getBeginningOfCurrentWordBufferPosition())
    }

    // Public: Moves the cursor to the end of the word.
    moveToEndOfWord () {
      let position
      if (position = this.getEndOfCurrentWordBufferPosition()) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the beginning of the next word.
    moveToBeginningOfNextWord () {
      let position
      if (position = this.getBeginningOfNextWordBufferPosition()) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the previous word boundary.
    moveToPreviousWordBoundary () {
      let position
      if (position = this.getPreviousWordBoundaryBufferPosition()) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the next word boundary.
    moveToNextWordBoundary () {
      let position
      if (position = this.getNextWordBoundaryBufferPosition()) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the previous subword boundary.
    moveToPreviousSubwordBoundary () {
      let position
      const options = { wordRegex: this.subwordRegExp({ backwards: true }) }
      if (position = this.getPreviousWordBoundaryBufferPosition(options)) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the next subword boundary.
    moveToNextSubwordBoundary () {
      let position
      const options = { wordRegex: this.subwordRegExp() }
      if (position = this.getNextWordBoundaryBufferPosition(options)) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the beginning of the buffer line, skipping all
    // whitespace.
    skipLeadingWhitespace () {
      const position = this.getBufferPosition()
      const scanRange = this.getCurrentLineBufferRange()
      let endOfLeadingWhitespace = null
      this.editor.scanInBufferRange(/^[ \t]*/, scanRange, ({ range }) => endOfLeadingWhitespace = range.end)

      if (endOfLeadingWhitespace.isGreaterThan(position)) { return this.setBufferPosition(endOfLeadingWhitespace) }
    }

    // Public: Moves the cursor to the beginning of the next paragraph
    moveToBeginningOfNextParagraph () {
      let position
      if (position = this.getBeginningOfNextParagraphBufferPosition()) {
        return this.setBufferPosition(position)
      }
    }

    // Public: Moves the cursor to the beginning of the previous paragraph
    moveToBeginningOfPreviousParagraph () {
      let position
      if (position = this.getBeginningOfPreviousParagraphBufferPosition()) {
        return this.setBufferPosition(position)
      }
    }

    /*
    Section: Local Positions and Ranges
    */

    // Public: Returns buffer position of previous word boundary. It might be on
    // the current word, or the previous word.
    //
    // * `options` (optional) {Object} with the following keys:
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //      (default: {::wordRegExp})
    getPreviousWordBoundaryBufferPosition (options) {
      if (options == null) { options = {} }
      const currentBufferPosition = this.getBufferPosition()
      const previousNonBlankRow = this.editor.buffer.previousNonBlankRow(currentBufferPosition.row)
      const scanRange = [[previousNonBlankRow != null ? previousNonBlankRow : 0, 0], currentBufferPosition]

      let beginningOfWordPosition = null
      this.editor.backwardsScanInBufferRange((options.wordRegex != null ? options.wordRegex : this.wordRegExp()), scanRange, function ({ range, stop }) {
        if ((range.start.row < currentBufferPosition.row) && (currentBufferPosition.column > 0)) {
          // force it to stop at the beginning of each line
          beginningOfWordPosition = new Point(currentBufferPosition.row, 0)
        } else if (range.end.isLessThan(currentBufferPosition)) {
          beginningOfWordPosition = range.end
        } else {
          beginningOfWordPosition = range.start
        }

        if (!(beginningOfWordPosition != null ? beginningOfWordPosition.isEqual(currentBufferPosition) : undefined)) {
          return stop()
        }
      })

      return beginningOfWordPosition || currentBufferPosition
    }

    // Public: Returns buffer position of the next word boundary. It might be on
    // the current word, or the previous word.
    //
    // * `options` (optional) {Object} with the following keys:
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //      (default: {::wordRegExp})
    getNextWordBoundaryBufferPosition (options) {
      if (options == null) { options = {} }
      const currentBufferPosition = this.getBufferPosition()
      const scanRange = [currentBufferPosition, this.editor.getEofBufferPosition()]

      let endOfWordPosition = null
      this.editor.scanInBufferRange((options.wordRegex != null ? options.wordRegex : this.wordRegExp()), scanRange, function ({ range, stop }) {
        if (range.start.row > currentBufferPosition.row) {
          // force it to stop at the beginning of each line
          endOfWordPosition = new Point(range.start.row, 0)
        } else if (range.start.isGreaterThan(currentBufferPosition)) {
          endOfWordPosition = range.start
        } else {
          endOfWordPosition = range.end
        }

        if (!(endOfWordPosition != null ? endOfWordPosition.isEqual(currentBufferPosition) : undefined)) {
          return stop()
        }
      })

      return endOfWordPosition || currentBufferPosition
    }

    // Public: Retrieves the buffer position of where the current word starts.
    //
    // * `options` (optional) An {Object} with the following keys:
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //     (default: {::wordRegExp}).
    //   * `includeNonWordCharacters` A {Boolean} indicating whether to include
    //     non-word characters in the default word regex.
    //     Has no effect if wordRegex is set.
    //   * `allowPrevious` A {Boolean} indicating whether the beginning of the
    //     previous word can be returned.
    //
    // Returns a {Range}.
    getBeginningOfCurrentWordBufferPosition (options) {
      let left
      if (options == null) { options = {} }
      const allowPrevious = options.allowPrevious != null ? options.allowPrevious : true
      const currentBufferPosition = this.getBufferPosition()
      const previousNonBlankRow = (left = this.editor.buffer.previousNonBlankRow(currentBufferPosition.row)) != null ? left : 0
      const scanRange = [[previousNonBlankRow, 0], currentBufferPosition]

      let beginningOfWordPosition = null
      this.editor.backwardsScanInBufferRange((options.wordRegex != null ? options.wordRegex : this.wordRegExp(options)), scanRange, function ({ range, matchText, stop }) {
        // Ignore 'empty line' matches between '\r' and '\n'
        if ((matchText === '') && (range.start.column !== 0)) { return }

        if (range.start.isLessThan(currentBufferPosition)) {
          if (range.end.isGreaterThanOrEqual(currentBufferPosition) || allowPrevious) {
            beginningOfWordPosition = range.start
          }
          return stop()
        }
      })

      if (beginningOfWordPosition != null) {
        return beginningOfWordPosition
      } else if (allowPrevious) {
        return new Point(0, 0)
      } else {
        return currentBufferPosition
      }
    }

    // Public: Retrieves the buffer position of where the current word ends.
    //
    // * `options` (optional) {Object} with the following keys:
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //      (default: {::wordRegExp})
    //   * `includeNonWordCharacters` A Boolean indicating whether to include
    //     non-word characters in the default word regex. Has no effect if
    //     wordRegex is set.
    //
    // Returns a {Range}.
    getEndOfCurrentWordBufferPosition (options) {
      if (options == null) { options = {} }
      const allowNext = options.allowNext != null ? options.allowNext : true
      const currentBufferPosition = this.getBufferPosition()
      const scanRange = [currentBufferPosition, this.editor.getEofBufferPosition()]

      let endOfWordPosition = null
      this.editor.scanInBufferRange((options.wordRegex != null ? options.wordRegex : this.wordRegExp(options)), scanRange, function ({ range, matchText, stop }) {
        // Ignore 'empty line' matches between '\r' and '\n'
        if ((matchText === '') && (range.start.column !== 0)) { return }

        if (range.end.isGreaterThan(currentBufferPosition)) {
          if (allowNext || range.start.isLessThanOrEqual(currentBufferPosition)) {
            endOfWordPosition = range.end
          }
          return stop()
        }
      })

      return endOfWordPosition != null ? endOfWordPosition : currentBufferPosition
    }

    // Public: Retrieves the buffer position of where the next word starts.
    //
    // * `options` (optional) {Object}
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //     (default: {::wordRegExp}).
    //
    // Returns a {Range}
    getBeginningOfNextWordBufferPosition (options) {
      if (options == null) { options = {} }
      const currentBufferPosition = this.getBufferPosition()
      const start = this.isInsideWord(options) ? this.getEndOfCurrentWordBufferPosition(options) : currentBufferPosition
      const scanRange = [start, this.editor.getEofBufferPosition()]

      let beginningOfNextWordPosition = null
      this.editor.scanInBufferRange((options.wordRegex != null ? options.wordRegex : this.wordRegExp()), scanRange, function ({ range, stop }) {
        beginningOfNextWordPosition = range.start
        return stop()
      })

      return beginningOfNextWordPosition || currentBufferPosition
    }

    // Public: Returns the buffer Range occupied by the word located under the cursor.
    //
    // * `options` (optional) {Object}
    //   * `wordRegex` A {RegExp} indicating what constitutes a "word"
    //     (default: {::wordRegExp}).
    getCurrentWordBufferRange (options) {
      if (options == null) { options = {} }
      const startOptions = Object.assign(_.clone(options), { allowPrevious: false })
      const endOptions = Object.assign(_.clone(options), { allowNext: false })
      return new Range(this.getBeginningOfCurrentWordBufferPosition(startOptions), this.getEndOfCurrentWordBufferPosition(endOptions))
    }

    // Public: Returns the buffer Range for the current line.
    //
    // * `options` (optional) {Object}
    //   * `includeNewline` A {Boolean} which controls whether the Range should
    //     include the newline.
    getCurrentLineBufferRange (options) {
      return this.editor.bufferRangeForBufferRow(this.getBufferRow(), options)
    }

    // Public: Retrieves the range for the current paragraph.
    //
    // A paragraph is defined as a block of text surrounded by empty lines or comments.
    //
    // Returns a {Range}.
    getCurrentParagraphBufferRange () {
      return this.editor.languageMode.rowRangeForParagraphAtBufferRow(this.getBufferRow())
    }

    // Public: Returns the characters preceding the cursor in the current word.
    getCurrentWordPrefix () {
      return this.editor.getTextInBufferRange([this.getBeginningOfCurrentWordBufferPosition(), this.getBufferPosition()])
    }

    /*
    Section: Visibility
    */

    /*
    Section: Comparing to another cursor
    */

    // Public: Compare this cursor's buffer position to another cursor's buffer position.
    //
    // See {Point::compare} for more details.
    //
    // * `otherCursor`{Cursor} to compare against
    compare (otherCursor) {
      return this.getBufferPosition().compare(otherCursor.getBufferPosition())
    }

    /*
    Section: Utilities
    */

    // Public: Deselects the current selection.
    clearSelection (options) {
      return (this.selection != null ? this.selection.clear(options) : undefined)
    }

    // Public: Get the RegExp used by the cursor to determine what a "word" is.
    //
    // * `options` (optional) {Object} with the following keys:
    //   * `includeNonWordCharacters` A {Boolean} indicating whether to include
    //     non-word characters in the regex. (default: true)
    //
    // Returns a {RegExp}.
    wordRegExp (options) {
      const nonWordCharacters = _.escapeRegExp(this.getNonWordCharacters())
      let source = `^[\t ]*$|[^\\s${nonWordCharacters}]+`
      if ((options != null ? options.includeNonWordCharacters : undefined) != null ? (options != null ? options.includeNonWordCharacters : undefined) : true) {
        source += `|${`[${nonWordCharacters}]+`}`
      }
      return new RegExp(source, 'g')
    }

    // Public: Get the RegExp used by the cursor to determine what a "subword" is.
    //
    // * `options` (optional) {Object} with the following keys:
    //   * `backwards` A {Boolean} indicating whether to look forwards or backwards
    //     for the next subword. (default: false)
    //
    // Returns a {RegExp}.
    subwordRegExp (options) {
      if (options == null) { options = {} }
      const nonWordCharacters = this.getNonWordCharacters()
      const lowercaseLetters = 'a-z\\u00DF-\\u00F6\\u00F8-\\u00FF'
      const uppercaseLetters = 'A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE'
      const snakeCamelSegment = `[${uppercaseLetters}]?[${lowercaseLetters}]+`
      const segments = [
        '^[\t ]+',
        '[\t ]+$',
        `[${uppercaseLetters}]+(?![${lowercaseLetters}])`,
        '\\d+'
      ]
      if (options.backwards) {
        segments.push(`${snakeCamelSegment}_*`)
        segments.push(`[${_.escapeRegExp(nonWordCharacters)}]+\\s*`)
      } else {
        segments.push(`_*${snakeCamelSegment}`)
        segments.push(`\\s*[${_.escapeRegExp(nonWordCharacters)}]+`)
      }
      segments.push('_+')
      return new RegExp(segments.join('|'), 'g')
    }

    /*
    Section: Private
    */

    getNonWordCharacters () {
      return this.editor.getNonWordCharacters(this.getScopeDescriptor().getScopesArray())
    }

    changePosition (options, fn) {
      this.clearSelection({ autoscroll: false })
      fn()
      if (options.autoscroll != null ? options.autoscroll : this.isLastCursor()) { return this.autoscroll() }
    }

    getScreenRange () {
      const { row, column } = this.getScreenPosition()
      return new Range(new Point(row, column), new Point(row, column + 1))
    }

    autoscroll (options) {
      if (options == null) { options = {} }
      options.clip = false
      return this.editor.scrollToScreenRange(this.getScreenRange(), options)
    }

    getBeginningOfNextParagraphBufferPosition () {
      const start = this.getBufferPosition()
      const eof = this.editor.getEofBufferPosition()
      const scanRange = [start, eof]

      const { row, column } = eof
      let position = new Point(row, column - 1)

      this.editor.scanInBufferRange(EmptyLineRegExp, scanRange, function ({ range, stop }) {
        position = range.start.traverse(Point(1, 0))
        if (!position.isEqual(start)) { return stop() }
      })
      return position
    }

    getBeginningOfPreviousParagraphBufferPosition () {
      const start = this.getBufferPosition()

      const { row, column } = start
      const scanRange = [[row - 1, column], [0, 0]]
      let position = new Point(0, 0)
      this.editor.backwardsScanInBufferRange(EmptyLineRegExp, scanRange, function ({ range, stop }) {
        position = range.start.traverse(Point(1, 0))
        if (!position.isEqual(start)) { return stop() }
      })
      return position
    }
  }
  Cursor.initClass()
  return Cursor
})())
