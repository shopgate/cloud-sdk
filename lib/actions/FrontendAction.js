/**
 * Copyright (c) 2017, Shopgate, Inc. All rights reserved.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
const fsEx = require('fs-extra')
const path = require('path')
const inquirer = require('inquirer')
const logger = require('../logger')
const UserSettings = require('../user/UserSettings')
const AppSettings = require('../app/AppSettings')
const FrontendProcess = require('../app/frontend/FrontendProcess')
const FrontendSetup = require('../app/frontend/FrontendSetup')
const DcHttpClient = require('../DcHttpClient')
const utils = require('../utils/utils')

/**
 * The FrontendAction class.
 */
class FrontendAction {
  /**
   * @param {AppSettings} appSettings
   */
  constructor (appSettings) {
    this.appSettings = appSettings
    this.userSettings = new UserSettings().validate()
    this.settingsFolder = path.join(this.appSettings.getApplicationFolder(), AppSettings.SETTINGS_FOLDER)
    this.dcClient = new DcHttpClient(this.userSettings, logger)
    this.frontendSetup = new FrontendSetup(this.dcClient, this.appSettings)
  }

  /**
   * Registers the frontend command.
   * @param {Command} caporal Instance of the commander module.
   * @param {AppSettings} appSettings
   */
  static register (caporal, appSettings) {
    caporal
      .command('frontend start')
      .description('Starts the webpack dev server for the frontend development')
      .option('-t, --theme [value]', 'The name of the theme that you want to be compiled by webpack.')
      .option('-h, --host [value]', 'The URL or IP address of your local development environment.')
      .option('-p, --port [value]', 'The port to use for accessing the output via browser.')
      .action((args, options) => new FrontendAction(appSettings).run('start', args, options))

    caporal
      .command('frontend setup')
      .description('Changes the settings for the frontend development')
      .action((args, options) => new FrontendAction(appSettings).run('setup', args, options))
  }

  /**
   * Find all themes inside the project.
   * @returns {Array}
   */
  async findThemes () {
    // Absolute path to the themes.
    const source = path.resolve(this.appSettings.getApplicationFolder(), AppSettings.THEMES_FOLDER)

    // Get all folders inside the themes directory.
    const folders = await fsEx.readdir(source)

    const promises = folders.map(folder => fsEx.lstat(path.join(source, folder)))
    const results = await Promise.all(promises)

    return folders.filter((folder, index) => results[index].isDirectory())
  }

  /**
   * Inquires a theme selection if not theme was set as an option.
   * @return {Promise}
   */
  requestThemeOption () {
    return new Promise(async (resolve, reject) => {
      const themes = await this.findThemes()
      if (themes.length === 1) return resolve(themes[0])

      inquirer
        .prompt([{
          type: 'list',
          name: 'theme',
          message: 'Please choose a theme to use',
          choices: themes
        }])
        .then(answers => resolve(answers.theme))
        .catch(error => reject(error))
    })
  }

  /**
   * Runs the frontend process.
   * @param {string} action The action to perform.
   * @param {Object} [args={}] The process args.
   * @param {Object} [options={}] The process options.
   */
  async run (action, args, options = {}) {
    this.userSettings = new UserSettings().validate()
    await this.appSettings.validate()

    const pid = await utils.previousProcess('frontend', this.settingsFolder)
    if (pid) throw new Error(`Frontend process is already running with pid: ${pid}. Please quit this process first.`)

    switch (action) {
      default:
      case 'start': {
        let theme = options.theme
        if (!theme) theme = await this.requestThemeOption()
        await this.start({...options, theme}, await this.buildThemePath(theme))
        break
      }
      case 'setup': {
        await this.frontendSetup.run()
        break
      }
    }

    process.on('SIGINT', async () => {
      await utils.deleteProcessFile('frontend', this.settingsFolder)
    })
  }

  /**
   * Builds the theme folder path.
   * @param {string} theme The theme folder.
   * @return {string}
   */
  async buildThemePath (theme) {
    const themePath = path.join(this.appSettings.getApplicationFolder(), AppSettings.THEMES_FOLDER, theme)
    if (!await fsEx.exists(themePath)) {
      throw new Error(`Can't find theme '${theme}'. Please make sure you passed the right theme.`)
    }
    return themePath
  }

  /**
   * Runs the 'start' command.
   * @param {Object} options The process options.
   * @param {string} themeFolder The theme folder.
   */
  async start (options, themeFolder) {
    const frontend = new FrontendProcess(options, this.frontendSetup, this.appSettings)

    await this.updateThemeConfig(themeFolder)
    await frontend.run()
    await utils.setProcessFile('frontend', this.settingsFolder, process.pid)
  }

  async updateThemeConfig (templateFolder) {
    logger.info(`Generating theme config`)
    const extensionConfigFile = await fsEx.readJSON(path.join(templateFolder, 'extension-config.json'))

    return this.dcClient.generateExtensionConfig(extensionConfigFile, await this.appSettings.getId())
      .then((extConfig) => {
        if (!extConfig.frontend) return logger.warn('No config with the destination \'frontend\' found')
        const appJsonFile = path.join(templateFolder, 'config', 'app.json')
        return fsEx.outputJson(appJsonFile, extConfig.frontend, {spaces: 2})
      })
      .then(() => {
        logger.info(`Updated theme config`)
      })
      .catch(err => {
        throw new Error('Could not generate config: ' + err.message)
      })
  }
}

module.exports = FrontendAction
