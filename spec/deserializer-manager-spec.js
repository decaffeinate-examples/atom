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
const DeserializerManager = require('../src/deserializer-manager')

describe('DeserializerManager', function () {
  let manager = null

  class Foo {
    static deserialize ({ name }) { return new Foo(name) }
    constructor (name) {
      this.name = name
    }
  }

  beforeEach(() => manager = new DeserializerManager())

  describe('::add(deserializer)', () =>
    it('returns a disposable that can be used to remove the manager', function () {
      const disposable = manager.add(Foo)
      expect(manager.deserialize({ deserializer: 'Foo', name: 'Bar' })).toBeDefined()
      disposable.dispose()
      spyOn(console, 'warn')
      return expect(manager.deserialize({ deserializer: 'Foo', name: 'Bar' })).toBeUndefined()
    })
  )

  return describe('::deserialize(state)', function () {
    beforeEach(() => manager.add(Foo))

    it("calls deserialize on the manager for the given state object, or returns undefined if one can't be found", function () {
      spyOn(console, 'warn')
      const object = manager.deserialize({ deserializer: 'Foo', name: 'Bar' })
      expect(object.name).toBe('Bar')
      return expect(manager.deserialize({ deserializer: 'Bogus' })).toBeUndefined()
    })

    return describe('when the manager has a version', function () {
      beforeEach(() => Foo.version = 2)

      describe('when the deserialized state has a matching version', () =>
        it('attempts to deserialize the state', function () {
          const object = manager.deserialize({ deserializer: 'Foo', version: 2, name: 'Bar' })
          return expect(object.name).toBe('Bar')
        })
      )

      return describe('when the deserialized state has a non-matching version', () =>
        it('returns undefined', function () {
          expect(manager.deserialize({ deserializer: 'Foo', version: 3, name: 'Bar' })).toBeUndefined()
          expect(manager.deserialize({ deserializer: 'Foo', version: 1, name: 'Bar' })).toBeUndefined()
          return expect(manager.deserialize({ deserializer: 'Foo', name: 'Bar' })).toBeUndefined()
        })
      )
    })
  })
})
