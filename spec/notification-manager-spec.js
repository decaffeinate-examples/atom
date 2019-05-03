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
const NotificationManager = require('../src/notification-manager')

describe('NotificationManager', function () {
  let [manager] = Array.from([])

  beforeEach(() => manager = new NotificationManager())

  describe('the atom global', () =>
    it('has a notifications instance', () => expect(atom.notifications instanceof NotificationManager).toBe(true))
  )

  return describe('adding events', function () {
    let addSpy = null

    beforeEach(function () {
      addSpy = jasmine.createSpy()
      return manager.onDidAddNotification(addSpy)
    })

    it('emits an event when a notification has been added', function () {
      manager.add('error', 'Some error!', { icon: 'someIcon' })
      expect(addSpy).toHaveBeenCalled()

      const notification = addSpy.mostRecentCall.args[0]
      expect(notification.getType()).toBe('error')
      expect(notification.getMessage()).toBe('Some error!')
      return expect(notification.getIcon()).toBe('someIcon')
    })

    it('emits a fatal error ::addFatalError has been called', function () {
      manager.addFatalError('Some error!', { icon: 'someIcon' })
      expect(addSpy).toHaveBeenCalled()
      const notification = addSpy.mostRecentCall.args[0]
      return expect(notification.getType()).toBe('fatal')
    })

    it('emits an error ::addError has been called', function () {
      manager.addError('Some error!', { icon: 'someIcon' })
      expect(addSpy).toHaveBeenCalled()
      const notification = addSpy.mostRecentCall.args[0]
      return expect(notification.getType()).toBe('error')
    })

    it('emits a warning notification ::addWarning has been called', function () {
      manager.addWarning('Something!', { icon: 'someIcon' })
      expect(addSpy).toHaveBeenCalled()
      const notification = addSpy.mostRecentCall.args[0]
      return expect(notification.getType()).toBe('warning')
    })

    it('emits an info notification ::addInfo has been called', function () {
      manager.addInfo('Something!', { icon: 'someIcon' })
      expect(addSpy).toHaveBeenCalled()
      const notification = addSpy.mostRecentCall.args[0]
      return expect(notification.getType()).toBe('info')
    })

    return it('emits a success notification ::addSuccess has been called', function () {
      manager.addSuccess('Something!', { icon: 'someIcon' })
      expect(addSpy).toHaveBeenCalled()
      const notification = addSpy.mostRecentCall.args[0]
      return expect(notification.getType()).toBe('success')
    })
  })
})
