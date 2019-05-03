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
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const DecorationManager = require('../src/decoration-manager')
const TextEditor = require('../src/text-editor')

describe('DecorationManager', function () {
  let [decorationManager, buffer, editor, markerLayer1, markerLayer2] = Array.from([])

  beforeEach(function () {
    buffer = atom.project.bufferForPathSync('sample.js')
    editor = new TextEditor({ buffer })
    markerLayer1 = editor.addMarkerLayer()
    markerLayer2 = editor.addMarkerLayer()
    decorationManager = new DecorationManager(editor)

    return waitsForPromise(() => atom.packages.activatePackage('language-javascript'))
  })

  afterEach(() => buffer.destroy())

  describe('decorations', function () {
    let [layer1Marker, layer2Marker, layer1MarkerDecoration, layer2MarkerDecoration, decorationProperties] = Array.from([])
    beforeEach(function () {
      layer1Marker = markerLayer1.markBufferRange([[2, 13], [3, 15]])
      decorationProperties = { type: 'line-number', class: 'one' }
      layer1MarkerDecoration = decorationManager.decorateMarker(layer1Marker, decorationProperties)
      layer2Marker = markerLayer2.markBufferRange([[2, 13], [3, 15]])
      return layer2MarkerDecoration = decorationManager.decorateMarker(layer2Marker, decorationProperties)
    })

    it('can add decorations associated with markers and remove them', function () {
      expect(layer1MarkerDecoration).toBeDefined()
      expect(layer1MarkerDecoration.getProperties()).toBe(decorationProperties)
      expect(decorationManager.decorationsForScreenRowRange(2, 3)).toEqual({
        [layer1Marker.id]: [layer1MarkerDecoration],
        [layer2Marker.id]: [layer2MarkerDecoration]
      })

      layer1MarkerDecoration.destroy()
      expect(decorationManager.decorationsForScreenRowRange(2, 3)[layer1Marker.id]).not.toBeDefined()
      layer2MarkerDecoration.destroy()
      return expect(decorationManager.decorationsForScreenRowRange(2, 3)[layer2Marker.id]).not.toBeDefined()
    })

    it('will not fail if the decoration is removed twice', function () {
      layer1MarkerDecoration.destroy()
      return layer1MarkerDecoration.destroy()
    })

    it('does not allow destroyed markers to be decorated', function () {
      layer1Marker.destroy()
      expect(() => decorationManager.decorateMarker(layer1Marker, { type: 'overlay', item: document.createElement('div') })).toThrow('Cannot decorate a destroyed marker')
      return expect(decorationManager.getOverlayDecorations()).toEqual([])
    })

    it('does not allow destroyed marker layers to be decorated', function () {
      const layer = editor.addMarkerLayer()
      layer.destroy()
      return expect(() => decorationManager.decorateMarkerLayer(layer, { type: 'highlight' })).toThrow('Cannot decorate a destroyed marker layer')
    })

    describe('when a decoration is updated via Decoration::update()', () =>
      it("emits an 'updated' event containing the new and old params", function () {
        let updatedSpy
        layer1MarkerDecoration.onDidChangeProperties(updatedSpy = jasmine.createSpy())
        layer1MarkerDecoration.setProperties({ type: 'line-number', class: 'two' })

        const { oldProperties, newProperties } = updatedSpy.mostRecentCall.args[0]
        expect(oldProperties).toEqual(decorationProperties)
        return expect(newProperties).toEqual({ type: 'line-number', gutterName: 'line-number', class: 'two' })
      })
    )

    return describe('::getDecorations(properties)', () =>
      it('returns decorations matching the given optional properties', function () {
        expect(decorationManager.getDecorations()).toEqual([layer1MarkerDecoration, layer2MarkerDecoration])
        expect(decorationManager.getDecorations({ class: 'two' }).length).toEqual(0)
        return expect(decorationManager.getDecorations({ class: 'one' }).length).toEqual(2)
      })
    )
  })

  return describe('::decorateMarker', () =>
    describe('when decorating gutters', function () {
      let [layer1Marker] = Array.from([])

      beforeEach(() => layer1Marker = markerLayer1.markBufferRange([[1, 0], [1, 0]]))

      it("creates a decoration that is both of 'line-number' and 'gutter' type when called with the 'line-number' type", function () {
        const decorationProperties = { type: 'line-number', class: 'one' }
        const layer1MarkerDecoration = decorationManager.decorateMarker(layer1Marker, decorationProperties)
        expect(layer1MarkerDecoration.isType('line-number')).toBe(true)
        expect(layer1MarkerDecoration.isType('gutter')).toBe(true)
        expect(layer1MarkerDecoration.getProperties().gutterName).toBe('line-number')
        return expect(layer1MarkerDecoration.getProperties().class).toBe('one')
      })

      return it("creates a decoration that is only of 'gutter' type if called with the 'gutter' type and a 'gutterName'", function () {
        const decorationProperties = { type: 'gutter', gutterName: 'test-gutter', class: 'one' }
        const layer1MarkerDecoration = decorationManager.decorateMarker(layer1Marker, decorationProperties)
        expect(layer1MarkerDecoration.isType('gutter')).toBe(true)
        expect(layer1MarkerDecoration.isType('line-number')).toBe(false)
        expect(layer1MarkerDecoration.getProperties().gutterName).toBe('test-gutter')
        return expect(layer1MarkerDecoration.getProperties().class).toBe('one')
      })
    })
  )
})
