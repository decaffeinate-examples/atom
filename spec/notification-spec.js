/** @babel */
/* eslint-disable
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
const Notification = require('../src/notification')

describe('Notification', function () {
  let [notification] = Array.from([])

  it('throws an error when created with a non-string message', function () {
    expect(() => new Notification('error', null)).toThrow()
    expect(() => new Notification('error', 3)).toThrow()
    expect(() => new Notification('error', {})).toThrow()
    expect(() => new Notification('error', false)).toThrow()
    return expect(() => new Notification('error', [])).toThrow()
  })

  it('throws an error when created with non-object options', function () {
    expect(() => new Notification('error', 'message', 'foo')).toThrow()
    expect(() => new Notification('error', 'message', 3)).toThrow()
    expect(() => new Notification('error', 'message', false)).toThrow()
    return expect(() => new Notification('error', 'message', [])).toThrow()
  })

  describe('::getTimestamp()', () =>
    it('returns a Date object', function () {
      notification = new Notification('error', 'message!')
      return expect(notification.getTimestamp() instanceof Date).toBe(true)
    })
  )

  describe('::getIcon()', function () {
    it('returns a default when no icon specified', function () {
      notification = new Notification('error', 'message!')
      return expect(notification.getIcon()).toBe('flame')
    })

    return it('returns the icon specified', function () {
      notification = new Notification('error', 'message!', { icon: 'my-icon' })
      return expect(notification.getIcon()).toBe('my-icon')
    })
  })

  return describe('dismissing notifications', function () {
    describe('when the notfication is dismissable', () =>
      it('calls a callback when the notification is dismissed', function () {
        const dismissedSpy = jasmine.createSpy()
        notification = new Notification('error', 'message', { dismissable: true })
        notification.onDidDismiss(dismissedSpy)

        expect(notification.isDismissable()).toBe(true)
        expect(notification.isDismissed()).toBe(false)

        notification.dismiss()

        expect(dismissedSpy).toHaveBeenCalled()
        return expect(notification.isDismissed()).toBe(true)
      })
    )

    return describe('when the notfication is not dismissable', () =>
      it('does nothing when ::dismiss() is called', function () {
        const dismissedSpy = jasmine.createSpy()
        notification = new Notification('error', 'message')
        notification.onDidDismiss(dismissedSpy)

        expect(notification.isDismissable()).toBe(false)
        expect(notification.isDismissed()).toBe(true)

        notification.dismiss()

        expect(dismissedSpy).not.toHaveBeenCalled()
        return expect(notification.isDismissed()).toBe(true)
      })
    )
  })
})
