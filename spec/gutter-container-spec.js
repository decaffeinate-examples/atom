/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Gutter = require('../src/gutter')
const GutterContainer = require('../src/gutter-container')

describe('GutterContainer', function () {
  let gutterContainer = null
  const fakeTextEditor = {
    scheduleComponentUpdate () {}
  }

  beforeEach(() => gutterContainer = new GutterContainer(fakeTextEditor))

  describe('when initialized', () =>
    it('it has no gutters', () => expect(gutterContainer.getGutters().length).toBe(0))
  )

  describe('::addGutter', function () {
    it('creates a new gutter', function () {
      const newGutter = gutterContainer.addGutter({ 'test-gutter': 'test-gutter', priority: 1 })
      expect(gutterContainer.getGutters()).toEqual([newGutter])
      return expect(newGutter.priority).toBe(1)
    })

    it('throws an error if the provided gutter name is already in use', function () {
      const name = 'test-gutter'
      gutterContainer.addGutter({ name })
      return expect(gutterContainer.addGutter.bind(null, { name })).toThrow()
    })

    return it('keeps added gutters sorted by ascending priority', function () {
      const gutter1 = gutterContainer.addGutter({ name: 'first', priority: 1 })
      const gutter3 = gutterContainer.addGutter({ name: 'third', priority: 3 })
      const gutter2 = gutterContainer.addGutter({ name: 'second', priority: 2 })
      return expect(gutterContainer.getGutters()).toEqual([gutter1, gutter2, gutter3])
    })
  })

  describe('::removeGutter', function () {
    let removedGutters = null

    beforeEach(function () {
      gutterContainer = new GutterContainer(fakeTextEditor)
      removedGutters = []
      return gutterContainer.onDidRemoveGutter(gutterName => removedGutters.push(gutterName))
    })

    it('removes the gutter if it is contained by this GutterContainer', function () {
      const gutter = gutterContainer.addGutter({ 'test-gutter': 'test-gutter' })
      expect(gutterContainer.getGutters()).toEqual([gutter])
      gutterContainer.removeGutter(gutter)
      expect(gutterContainer.getGutters().length).toBe(0)
      return expect(removedGutters).toEqual([gutter.name])
    })

    return it('throws an error if the gutter is not within this GutterContainer', function () {
      const fakeOtherTextEditor = {}
      const otherGutterContainer = new GutterContainer(fakeOtherTextEditor)
      const gutter = new Gutter('gutter-name', otherGutterContainer)
      return expect(gutterContainer.removeGutter.bind(null, gutter)).toThrow()
    })
  })

  return describe('::destroy', () =>
    it('clears its array of gutters and destroys custom gutters', function () {
      const newGutter = gutterContainer.addGutter({ 'test-gutter': 'test-gutter', priority: 1 })
      const newGutterSpy = jasmine.createSpy()
      newGutter.onDidDestroy(newGutterSpy)

      gutterContainer.destroy()
      expect(newGutterSpy).toHaveBeenCalled()
      return expect(gutterContainer.getGutters()).toEqual([])
    })
  )
})
