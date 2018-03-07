const assert = require('assert')
const Context = require('../../../../../lib/app/backend/extensionRuntime/context/Context')
const fsExtra = require('fs-extra')
const path = require('path')
const request = require('request')

const defaultMeta = { appId: 'shop_1337', deviceId: '1234567890' }

describe('Context', () => {
  it('should have meta', () => {
    const context = new Context(null, null, null, '', defaultMeta, null)
    assert.deepEqual(context.meta, defaultMeta)
  })

  it('should have config', () => {
    const config = { foo: { bar: {} } }
    const context = new Context(null, config, null, '', defaultMeta, null)
    assert.deepEqual(context.config, config)
  })

  it('should have log', () => {
    const log = {}
    const context = new Context(null, null, null, '', defaultMeta, log)
    assert.equal(context.log, log)
  })

  describe('storageInterfaces', () => {
    it('should have storageInterfaces', () => {
      const context = new Context(null, null, null, '', defaultMeta, null)
      const storageInterfaceNames = ['extension', 'device', 'user']
      const storageInterfaceFunctionNames = ['get', 'set', 'del']
      assert.deepEqual(Object.keys(context.storage), storageInterfaceNames)
      storageInterfaceNames.forEach((storageInterfaceName) => {
        assert.deepEqual(Object.keys(context.storage[storageInterfaceName]), storageInterfaceFunctionNames)
      })
    })

    fsExtra.readJsonSync(path.join(__dirname, 'storageTests.json')).forEach((test) => {
      it('should ' + test.should, (done) => {
        const storage = {}
        storage[test.method] = (path, value, cb) => {
          assert.equal(path, test.path)
          switch (test.method) {
            case 'get':
              return value(null, test.value)
            case 'set':
              assert.equal(value, test.value)
              return cb()
            case 'del':
              return value()
          }
        }

        const context = new Context(storage, null, null, test.extensionId, test.meta || defaultMeta, null)

        function doneCb (err, value) {
          if (!test.err) {
            assert.equal(value, test.method === 'get' ? test.value : undefined)
            return done(err)
          }
          assert.equal(err.message, test.err)
          assert.equal(value, undefined)
          done()
        }

        context.storage[test.type][test.method](test.key, test.method === 'set' ? test.value : doneCb, doneCb)
      })
    })
  })

  it('should have settings', (done) => {
    const settingsKey = 'settingsValue'
    const settingsValue = 'settingsValue'
    const extensionId = 'settings.extension.get'
    const appId = 'shop_1337'
    const storage = {
      get: (path, cb) => {
        assert.equal(path, `${appId}/${extensionId}/settings/${settingsKey}`)
        cb(null, settingsValue)
      }
    }

    const context = new Context(storage, null, null, extensionId, defaultMeta, null)
    assert.deepEqual(Object.keys(context.settings), ['get'])

    context.settings.get(settingsKey, (err, value) => {
      assert.ifError(err)
      assert.equal(value, settingsValue)
      done()
    })
  })

  it('should have app info', (done) => {
    const expected = { appInfo: '1337' }
    let requestAppInfoCallCounter = 0

    const dcResponseHandlerMock = {
      requestAppInfo: (appId, deviceId, cb) => {
        assert.equal(appId, defaultMeta.appId)
        assert.equal(deviceId, defaultMeta.deviceId)
        requestAppInfoCallCounter++
        cb(null, expected)
      }
    }

    const context = new Context(null, null, dcResponseHandlerMock, '', defaultMeta, null)
    assert.equal(Object.keys(context.app), 'getInfo')
    context.app.getInfo((err, actual) => {
      assert.ifError(err)
      assert.equal(requestAppInfoCallCounter, 1)
      assert.equal(actual, expected)
      done()
    })
  })

  it('should have device info', (done) => {
    const expected = { deviceInfo: '1337' }
    let requestDeviceInfoCallCounter = 0

    const dcResponseHandlerMock = {
      requestDeviceInfo: (appId, deviceId, cb) => {
        assert.equal(appId, defaultMeta.appId)
        assert.equal(deviceId, defaultMeta.deviceId)
        requestDeviceInfoCallCounter++
        cb(null, expected)
      }
    }

    const context = new Context(null, null, dcResponseHandlerMock, '', defaultMeta, null)
    assert.equal(Object.keys(context.device), 'getInfo')
    context.device.getInfo((err, actual) => {
      assert.ifError(err)
      assert.equal(requestDeviceInfoCallCounter, 1)
      assert.equal(actual, expected)
      done()
    })
  })

  it('should have tracedRequest', () => {
    const context = new Context(null, null, null, '', defaultMeta, null)
    assert.equal(typeof context.tracedRequest, 'function')
    assert.equal(context.tracedRequest(), request)
  })
})
