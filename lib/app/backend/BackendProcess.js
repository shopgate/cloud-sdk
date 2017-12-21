const io = require('socket.io-client')
const async = require('neo-async')
const logger = require('../../logger')
const AppSettings = require('../AppSettings')
const UserSettings = require('../../user/UserSettings')
const AttachedExtensionsWatcher = require('../AttachedExtensionsWatcher')
const StepExecutor = require('./extensionRuntime/StepExecutor')

class BackendProcess {
  constructor (options, inspect) {
    this.dcAddress = process.env.SGCLOUD_DC_ADDRESS || 'https://developer-connector.shopgate.cloud'
    this.socket = null
    this.attachedExtensionsWatcher = new AttachedExtensionsWatcher(options)
    this.executor = new StepExecutor(logger, inspect)
  }

  connect (cb) {
    logger.info('Establishing SDK connection')

    const extraHeaders = {Authorization: 'Bearer ' + UserSettings.getInstance().getSession().getToken()}

    this.socket = io(this.dcAddress, {extraHeaders, transports: ['websocket'], autoConnect: false})
    this.socket
      .on('connect_error', () => logger.warn('Connection error! Trying to reconnect...'))
      .on('error', (err) => logger.error(err))
      .on('stepCall', (data, cb) => this.stepCall(data, cb))
      .on('updateToken', (data, cb) => this.updateToken(data, cb))

    this.attachedExtensionsWatcher.on('attach', (extensionInfo) => {
      logger.info(`Extension ${extensionInfo.id} (trusted: ${extensionInfo.trusted}) added`)
      this.socket.emit('registerExtension', {extensionId: extensionInfo.id, trusted: extensionInfo.trusted}, (err) => {
        if (err) return logger.error(`Error while attaching the extension ${extensionInfo.id} (trusted: ${extensionInfo.trusted}): ${err.message}`)
        logger.info(`Extension ${extensionInfo.id} (trusted: ${extensionInfo.trusted}) attached`)
      })
    })

    this.attachedExtensionsWatcher.on('detach', (extensionInfo) => {
      this.socket.emit('deregisterExtension', {extensionId: extensionInfo.id, trusted: extensionInfo.trusted}, (err) => {
        if (err) return logger.error(`Error while detaching the extension ${extensionInfo.id} (trusted: ${extensionInfo.trusted}): ${err.message}`)
        logger.info(`Extension ${extensionInfo.id} (trusted: ${extensionInfo.trusted}) detached`)
      })
    })

    this.executor.start((err) => {
      if (err) return cb(err)
      logger.debug('Step Executor started')

      async.parallel([
        (pCb) => this.executor.startWatcher(pCb),
        (pCb) => {
          let initialConnect = false
          this.socket.on('connect', () => {
            logger.info('SDK connection established')
            this.socket.emit('selectApplication', {applicationId: AppSettings.getInstance().getId()}, (err) => {
              if (err) return cb(err)
              logger.info(`Selected Application ${AppSettings.getInstance().getId()}`)
              if (initialConnect) return
              initialConnect = true
              this.attachedExtensionsWatcher.start(pCb)
            })
          })
          this.socket.connect()
        }
      ], cb)
    })
  }

  /**
   * @param {Object} data
   * @param {Object} data.stepMetaData
   * @param {String} data.stepMetaData.id
   * @param {String} data.stepMetaData.path
   * @param {Error|null} data.stepMetaData.catchableError
   * @param {Object} data.stepMetaData.meta
   * @param {Object} data.input
   * @param cb
   */
  stepCall (data, cb) {
    this.executor.execute(data.input, data.stepMetaData, cb)
  }

  /**
   * @param {Object} data
   * @param cb
   */
  updateToken (data, cb) {
    const userSettings = UserSettings.getInstance()
    userSettings.getSession().setToken(data)
    userSettings.save()
  }

  disconnect (cb = () => {}) {
    this.executor.stopWatcher(() => {
      this.executor.stop((err) => {
        if (err) this.log.debug(err)

        if (!this.socket) return cb()
        if (this.socket.disconnected) return cb()

        this.socket.removeListener('error')
        this.socket.disconnect()
        async.retry(
          {times: 5, interval: 10},
          (acb) => {
            if (this.socket.disconnected) return acb()
            acb(new Error('Not disconnected'))
          },
          cb
        )
      })
    })
  }
}

module.exports = BackendProcess
