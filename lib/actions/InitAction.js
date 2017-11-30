const UserSettings = require('../user/UserSettings')
const AppSettings = require('../app/AppSettings')
const logger = require('../logger')
const { SETTINGS_FOLDER, EXTENSIONS_FOLDER, PIPELINES_FOLDER, THEMES_FOLDER } = require('../app/AppSettings')
const inquirer = require('inquirer')
const FOLDERS = [SETTINGS_FOLDER, EXTENSIONS_FOLDER, PIPELINES_FOLDER, THEMES_FOLDER]
const path = require('path')
const fsEx = require('fs-extra')

class InitAction {
  /**
   * @param {Command} commander
   */
  register (commander) {
    commander
      .command('init')
      .description('init the sdk')
      .option('--appId <appId>', 'set the Sandbox App ID you want to initialize')
      .action(this.run.bind(this))
  }

  /**
   * @param {object} options
   * @param {function} [cb]
   */
  run (options, cb) {
    this.options = options
    if (!UserSettings.getInstance().getSession().getToken()) throw new Error('not logged in')

    let appSettings
    try {
      appSettings = AppSettings.getInstance()
    } catch (err) {
      return this.getAppId(inquirer.prompt, (err, appId) => {
        if (err) {
          if (cb) return cb(err)
          else throw err
        }

        FOLDERS.forEach(folder => {
          if (process.env.APP_PATH) folder = path.join(process.env.APP_PATH, folder)
          fsEx.ensureDir(folder)
        })

        const appSettings = new AppSettings()
        appSettings.setId(appId)
        appSettings.save()
        appSettings.init()

        AppSettings.setInstance(appSettings)
        logger.info(`The Application "${appId}" was successfully initialized`)
        if (cb) cb()
      })
    }

    throw new Error(`The current folder is already initialized for application ${appSettings.getId()}`)
  }

  /**
   * @param {*} prompt
   * @param {function} cb
   */
  getAppId (prompt, cb) {
    if (this.options.appId) return cb(null, this.options.appId)
    prompt([{type: 'input', name: 'appId', message: 'Enter your Sandbox App ID:'}]).then(answers => cb(null, answers.appId))
  }
}

module.exports = InitAction
