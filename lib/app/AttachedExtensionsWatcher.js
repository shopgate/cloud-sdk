const chokidar = require('chokidar')
const fsEx = require('fs-extra')
const async = require('neo-async')
const EventEmitter = require('events')
const t = require('../i18n')(__filename)

class AttachedExtensionsWatcher extends EventEmitter {
  /**
   * @param {AppSettings} appSettings
   */
  constructor (appSettings) {
    super()
    this.configPath = appSettings.attachedExtensionsFile
    this.appSettings = appSettings
    this.attachedExtensions = []
    this.options = { ignoreInitial: true }
    this.chokidar = chokidar
  }

  start () {
    return new Promise((resolve) => {
      this.appSettings.loadAttachedExtensions().then(extensions => {
        this.attachedExtensions = this._formatAttachedExtensionsToArray(extensions)

        this.watcher = this.chokidar.watch(this.configPath, this.options)
          .on('all', (event, path) => {
            fsEx.readJson(path, (err, config) => {
              if (err) throw err

              const updatedExtensions = this._formatAttachedExtensionsToArray(config.attachedExtensions)

              // Add new extensions
              updatedExtensions
                .filter((updated) => {
                  for (let i = 0; i < this.attachedExtensions.length; i++) {
                    if (updated.id === this.attachedExtensions[i].id) return false
                  }
                  return true
                })
                .forEach(ext => {
                  this.emit('attach', ext)
                })

              // Remove detached extensions
              this.attachedExtensions
                .filter((old) => {
                  for (let i = 0; i < updatedExtensions.length; i++) {
                    if (old.id === updatedExtensions[i].id) return false
                  }
                  return true
                })
                .forEach(ext => this.emit('detach', ext))

              this.attachedExtensions = updatedExtensions
            })
          })
          .on('ready', () => resolve())
      })
    })
  }

  _formatAttachedExtensionsToArray (attachedExtensions) {
    const updatedExtensionsKeys = Object.keys(attachedExtensions)
    const updatedExtensions = []
    for (let i = 0; i < updatedExtensionsKeys.length; i++) {
      const item = attachedExtensions[updatedExtensionsKeys[i]]
      item.id = updatedExtensionsKeys[i]
      updatedExtensions.push(item)
    }
    return updatedExtensions
  }

  stop () {
    return new Promise((resolve, reject) => {
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

module.exports = AttachedExtensionsWatcher
