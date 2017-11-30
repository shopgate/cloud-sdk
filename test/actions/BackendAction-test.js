/* eslint-disable standard/no-callback-literal */
const assert = require('assert')
const sinon = require('sinon')
const path = require('path')
const fsEx = require('fs-extra')
const proxyquire = require('proxyquire')
const async = require('neo-async')

const UserSettings = require('../../lib/user/UserSettings')
const AppSettings = require('../../lib/app/AppSettings')
const userSettingsFolder = path.join('build', 'usersettings')
const appPath = path.join('build', 'appsettings')

const callbacks = {
  connect: (cb) => cb(),
  selectApplication: (id, cb) => cb()
}

class BackendProcess {
  connect (cb) {
    process.nextTick(() => callbacks.connect(cb))
  }

  selectApplication (id, cb) {
    process.nextTick(() => callbacks.selectApplication(id, cb))
  }
}

describe('BackendAction', () => {
  let backendAction
  const BackendAction = proxyquire('../../lib/actions/BackendAction', {
    '../app/backend/BackendProcess': BackendProcess,
    '../logger': {
      info: () => {},
      error: () => {},
      debug: () => {}
    }
  })

  beforeEach(function (done) {
    backendAction = new BackendAction()

    fsEx.emptyDirSync(userSettingsFolder)
    process.env.USER_PATH = userSettingsFolder
    UserSettings.getInstance().getSession().token = {}

    backendAction.pipelineWatcher = {
      start: (cb) => cb(),
      close: () => {},
      on: (event, fn) => fn(event, path.join(process.env.APP_PATH, 'pipelines', 'testPipeline.json'))
    }
    backendAction.extensionConfigWatcher = {
      stop: (cb) => cb()
    }

    backendAction.cliProxy = {
      start: (cb) => cb(),
      server: {
        close: (cb) => cb()
      }
    }

    process.env.APP_PATH = appPath
    const appSettings = new AppSettings()
    fsEx.emptyDirSync(path.join(appPath, AppSettings.SETTINGS_FOLDER))
    appSettings.setId('foobarTest').setAttachedExtensions({}).save()

    appSettings.init()
    AppSettings.setInstance(appSettings)
    done()
  })

  afterEach(function (done) {
    UserSettings.setInstance()
    AppSettings.setInstance()
    delete process.env.USER_PATH
    delete process.env.APP_PATH

    backendAction.pipelineWatcher.close()
    backendAction.extensionConfigWatcher.stop((err) => {
      if (err) return done(err)
      async.parallel([
        (cb) => fsEx.remove(userSettingsFolder, cb),
        (cb) => fsEx.remove(appPath, cb)
      ], (err) => {
        done(err)
      })
    })
  })

  describe('general', () => {
    it('should register', () => {
      const commander = {}
      commander.command = sinon.stub().returns(commander)
      commander.description = sinon.stub().returns(commander)
      commander.action = sinon.stub().returns(commander)

      backendAction.register(commander)

      assert(commander.command.calledWith('backend <action>'))
      assert(commander.description.calledOnce)
      assert(commander.action.calledOnce)
    })

    it('should throw if user not logged in', () => {
      UserSettings.getInstance().getSession().token = null
      try {
        backendAction.run('attach')
      } catch (err) {
        assert.equal(err.message, 'not logged in')
      }
    })

    it('should throw if invalid action is given', () => {
      try {
        backendAction.run('invalid')
      } catch (err) {
        assert.equal(err.message, 'unknown action "invalid"')
      }
    })
  })

  describe('watching', () => {
    it('should update pipelines', (done) => {
      backendAction.backendProcess = new BackendProcess()

      backendAction.extensionConfigWatcher = {
        start: () => { return backendAction.extensionConfigWatcher },
        stop: (cb) => { cb() },
        on: (name, cb) => { cb() }
      }
      backendAction.themeConfigWatcher = {
        start: () => { return backendAction.themeConfigWatcher },
        stop: (cb) => { cb() },
        on: (name, cb) => { cb() }
      }

      backendAction.dcClient = {
        downloadPipelines: (appId, cb) => cb(null, [{pipeline: {id: 'testPipeline'}}]),
        uploadPipeline: () => {}
      }
      backendAction._extensionChanged = (cfg, cb = () => {}) => {}
      backendAction._themeChanged = (cfg, cb = () => {}) => {}

      try {
        backendAction._startSubProcess()
      } catch (err) {
        assert.ifError(err)
      }

      setTimeout(() => {
        assert.deepEqual(
          fsEx.readJsonSync(path.join(process.env.APP_PATH, 'pipelines', 'testPipeline.json')),
          {pipeline: {id: 'testPipeline'}}
        )
        done()
      }, 50)
    })

    it('should call dcClient if pipelines were updated', (done) => {
      const pipeline = {pipeline: {id: 'plFooBarline'}}
      const appId = 'foobarAppIdDcTestBackendAction'
      AppSettings.getInstance().setId(appId)

      backendAction.dcClient = {
        uploadPipeline: (pl, aId, cb) => {
          assert.equal(pl, pipeline)
          assert.equal(aId, appId)
          cb()
        }
      }

      backendAction._pipelineChanged(pipeline, done)
    })

    it('should write generated extension-config if backend-extension was updated', (done) => {
      let generated = { backend: {id: 'myGeneratedExtension'} }
      backendAction.dcClient = {
        generateExtensionConfig: (config, appId, cb) => {
          cb(null, generated)
        }
      }

      const cfgPath = path.join(process.env.APP_PATH, 'extensions', 'testExt')

      backendAction._extensionChanged({ file: generated, path: cfgPath }, (err) => {
        assert.ifError(err)
        let cfg = fsEx.readJsonSync(path.join(cfgPath, 'extension', 'config.json'))
        assert.deepEqual(cfg, {id: 'myGeneratedExtension'})
        done()
      })
    })

    it('should write generated extension-config if frontend-extension was updated', (done) => {
      let generated = { frontend: {id: 'myGeneratedExtension'} }
      backendAction.dcClient = {
        generateExtensionConfig: (config, appId, cb) => {
          cb(null, generated)
        }
      }

      const cfgPath = path.join(process.env.APP_PATH, 'extension', 'testExt')

      backendAction._extensionChanged({ file: generated, path: cfgPath }, (err) => {
        assert.ifError(err)
        let cfg = fsEx.readJsonSync(path.join(cfgPath, 'frontend', 'config.json'))
        assert.deepEqual(cfg, {id: 'myGeneratedExtension'})
        done()
      })
    })

    it('should throw error if dcClient is not reachable', (done) => {
      backendAction.dcClient = {
        uploadPipeline: (pipeline, id, cb) => cb(new Error('EUNKNOWN'))
      }
      backendAction.backendProcess = {
        connect: (cb) => cb()
      }

      backendAction._pipelineChanged({pipeline: {id: 'testPipeline'}}, (err) => {
        assert.ok(err)
        assert.equal(err.message, `Could not upload pipeline 'testPipeline': EUNKNOWN`)
        done()
      })
    }).timeout(5000)

    it('should return if pipeline was changed', (done) => {
      backendAction.dcClient = {
        uploadPipeline: (pipeline, id, cb) => {
          cb()
        }
      }
      backendAction.backendProcess = {
        connect: (cb) => { cb() }
      }

      backendAction._pipelineChanged({pipeline: {id: 'testPipeline'}}, (err) => {
        assert.ifError(err)
        done()
      })
    })

    it('should work', () => {
      backendAction._startSubProcess = () => {}
      try {
        backendAction.run('start')
      } catch (err) {
        assert.ifError(err)
      }
    })
  })
})
