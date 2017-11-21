const assert = require('assert')
const sinon = require('sinon')
const path = require('path')
const fsEx = require('fs-extra')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const proxyquire = require('proxyquire')

const UserSettings = require('../../lib/user/UserSettings')
const AppSettings = require('../../lib/app/AppSettings')
const userSettingsFolder = path.join('test', 'usersettings')
const appPath = path.join('test', 'appsettings')

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
  let BackendAction
  let backendAction

  before(() => {
    BackendAction = proxyquire('../../lib/actions/BackendAction', {
      '../app/backend/BackendProcess': BackendProcess,
      '../logger': {
        info: () => {}
      }
    })
    backendAction = new BackendAction()
  })

  beforeEach(() => {
    process.env.USER_PATH = userSettingsFolder
    process.env.APP_PATH = appPath
    const appSettings = new AppSettings()
    mkdirp.sync(path.join(appPath, AppSettings.SETTINGS_FOLDER))
    appSettings.setId('foobarTest').setAttachedExtensions({}).save().init()
    AppSettings.setInstance(appSettings)
    UserSettings.getInstance().getSession().token = {}
  })

  afterEach((done) => {
    UserSettings.setInstance()
    delete process.env.USER_PATH
    if (backendAction.pipelineWatcher) {
      backendAction.pipelineWatcher.stop((err) => {
        if (err) return done(err)
        rimraf(userSettingsFolder, () => {
          rimraf(path.join('extensions'), () => {
            rimraf(path.join('pipelines'), done)
          })
        })
      })
    } else {
      rimraf(userSettingsFolder, () => {
        rimraf(path.join('extensions'), () => {
          rimraf(path.join('pipelines'), done)
        })
      })
    }
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

    it('should update pipelines', (done) => {
      backendAction.backendProcess = new BackendProcess()

      backendAction.pipelineWatcher = {
        start: () => { return backendAction.pipelineWatcher },
        stop: (cb) => { cb() },
        on: (name, cb) => {
          cb({
            pipeline: {pipeline: {id: 'testPipeline'}}
          })
        }
      }
      backendAction.dcClient = {
        getPipelines: (appId, cb) => {
          cb(null, [{
            pipeline: {
              id: 'testPipeline'
            }
          }])
        },
        updatePipeline: () => {}
      }

      try {
        backendAction._startSubProcess()
      } catch (err) {
        assert.ifError(err)
      }

      setTimeout(() => {
        assert.deepEqual(
          fsEx.readJsonSync(path.join(process.env.APP_PATH, 'pipelines', 'testPipeline.json')),
          {
            pipeline: {
              id: 'testPipeline'
            }
          }
        )
        done()
      }, 50)
    })

    it('should call dcClient if pipelines were updated', (done) => {
      backendAction.dcClient = {
        updatePipeline: (pipeline, id, userSession, cb) => {
          done()
          cb()
        },
        getPipelines: (appId, cb) => {cb(null, [{
          pipeline: {
            id: 'testPipeline'
          }
        }])}
      }
      backendAction.backendProcess = {
        connect: (cb) => { cb() }
      }
      backendAction.pipelineWatcher = {
        start: () => { return backendAction.pipelineWatcher },
        stop: (cb) => { cb() },
        on: (name, cb) => {
          cb({
            pipeline: {pipeline: {id: 'testPipeline'}}
          })
        }
      }

      backendAction._startSubProcess()
    })

    it('should throw error if dcClient is not reachable', (done) => {
      backendAction.dcClient = {
        updatePipeline: (pipeline, id, userSession, cb) => {
          cb({message: 'EUNKNOWN'})
        }
      }
      backendAction.backendProcess = {
        connect: (cb) => { cb() }
      }
      backendAction.pipelineWatcher = {
        start: () => { return backendAction.pipelineWatcher },
        stop: (cb) => { cb() },
        on: (name, cb) => {
          cb({
            pipeline: {pipeline: {id: 'testPipeline'}}
          })
        }
      }
      backendAction._pipelineChanged({pipeline: {id: 'testPipeline'}}, (err) => {
        assert.ok(err)
        assert.equal(err.message, `Could not update pipeline 'testPipeline'`)
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
