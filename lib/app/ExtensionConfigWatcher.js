const path = require('path')
const chokidar = require('chokidar')
const fsEx = require('fs-extra')
const async = require('neo-async')
const EventEmitter = require('events')
const logger = require('../logger')
const utils = require('../utils/utils')
const { EXTENSIONS_FOLDER } = require('../../lib/app/Constants')
const t = require('../i18n')(__filename)

let recheckInterval
class ExtensionConfigWatcher extends EventEmitter {
  /**
   * @param {Internal.AppSettings} appSettings
   */
  constructor (appSettings) {
    super()
    this.appSettings = appSettings
    this.watchFolder = path.join(appSettings.getApplicationFolder(), EXTENSIONS_FOLDER)
    this.chokidar = chokidar
  }

  start (source = 'backend') {
    return new Promise((resolve) => {
      const check = source === 'backend' ? 'frontend' : 'backend'
      const doStart = () => {
        logger.debug(t('STARTING_CONFIG_WATCHER'))
        const configPath = path.join(this.watchFolder, '*', 'extension-config.json')
        const options = {
          ignoreInitial: true,
          ignored: [
            'node_modules',
            'node_modules/**',
            '**/node_modules/**',
            '.*',
            '*.snap.*',
            '*.log'
          ]
        }
        this.watcher = this.chokidar.watch(configPath, options)
        this.watcher.on('all', async (event, configPath) => {
          const config = await fsEx.readJson(configPath, { throws: false })
          if (config) {
            this.emit('configChange', { file: config, path: path.dirname(configPath) })
          }
        })

        return resolve()
      }

      const recheck = () => {
        utils.getProcessId(check, this.appSettings.settingsFolder).then(otherPid => {
          if (!otherPid) {
            clearInterval(recheckInterval)
            doStart()
          }
        })
      }

      utils.getProcessId(check, this.appSettings.settingsFolder).then(otherPid => {
        // no watching needed for now
        if (otherPid) {
          logger.debug(t('ANOTHER_PROCESS_RUNNING'))
          recheckInterval = setInterval(recheck, 2000)
          resolve()
        } else {
          doStart()
        }
      })
    })
  }

  stop () {
    return new Promise((resolve, reject) => {
      if (recheckInterval) clearInterval(recheckInterval)
      if (!this.watcher) return resolve()
      this.watcher.close()
      async.retry({ times: 5, interval: 10 }, (acb) => {
        if (this.watcher.closed) return acb()
        acb(new Error(t('ERROR_NOT_DISCONNECTED')))
      }, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
}

module.exports = ExtensionConfigWatcher
