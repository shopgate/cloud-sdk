/**
 * Copyright (c) 2017, Shopgate, Inc. All rights reserved.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @ts-check
const path = require('path')
const FrontendSettings = require('./frontend/FrontendSettings')
const logger = require('../logger')
const fsEx = require('fs-extra')
const utils = require('../utils/utils')

const SETTINGS_FOLDER = '.sgcloud'
const EXTENSIONS_FOLDER = 'extensions'
const PIPELINES_FOLDER = 'pipelines'
const TRUSTED_PIPELINES_FOLDER = 'trustedPipelines'
const THEMES_FOLDER = 'themes'

class AppSettings {
  /**
   * Creates an instance of AppSettings.
   * @memberof AppSettings
   */
  constructor () {
    this.applicationFolder = utils.getApplicationFolder()
    this.settingsFolder = path.join(this.applicationFolder, SETTINGS_FOLDER)
    this.settingsFile = path.join(this.settingsFolder, 'app.json')
    this.attachedExtensionsFile = path.join(this.settingsFolder, 'attachedExtensions.json')
    this.frontendSettings = new FrontendSettings(path.join(this.settingsFolder))
  }

  /**
   * @returns {string}
   */
  getApplicationFolder () {
    return this.applicationFolder
  }

  /**
   * @returns {AppSettings}
   */
  validate () {
    this.getId()
    return this
  }

  /**
   * @returns {string}
   */
  getId () {
    const data = this._loadSettings()
    if (!data.id) throw new Error('The current folder seems not to be a sgcloud project. Please run sgcloud init first.')
    return data.id
  }

  /**
   * @param {string} id
   * @returns {AppSettings}
   */
  setId (id) {
    const data = this._loadSettings()
    data.id = id
    fsEx.ensureDirSync(this.settingsFolder)
    fsEx.writeJsonSync(this.settingsFile, data, {spaces: 2})
    return this
  }

  /**
   * @param {Object.<string, AttachedExtension>} extensions
   * @returns {AppSettings}
   */
  _saveExtensions (extensions) {
    fsEx.ensureDirSync(this.settingsFolder)
    fsEx.writeJsonSync(this.attachedExtensionsFile, {attachedExtensions: extensions})
    return this
  }

  /**
   * Attaches a extension
   * @param {string} pathName
   * @param {ExtensionInfo} extensionInfo
   * @param {Boolean} [force=false]
   * @returns {AppSettings}
   */
  attachExtension (pathName, extensionInfo, force) {
    const extensions = this.loadAttachedExtensions()
    if (!force && extensions[extensionInfo.id]) throw new Error(`Extension '${extensionInfo.id} (${pathName}) is already attached`)

    extensions[extensionInfo.id] = {path: pathName, trusted: extensionInfo.trusted}
    this._saveExtensions(extensions)
    logger.info(`Attached ${extensionInfo.id} (${pathName})`)
    return this
  }

  /**
   * Detaches a extension
   * @param {string} extensionId
   * @return {AppSettings}
   */
  detachExtension (extensionId) {
    const extensions = this.loadAttachedExtensions()
    if (!extensions[extensionId]) {
      logger.warn(`The extension '${extensionId}' is not attached`)
      return this
    }

    delete extensions[extensionId]
    this._saveExtensions(extensions)
    logger.info(`Detached ${extensionId}`)
    return this
  }

  /**
   * @return {Object.<string, AttachedExtension>}
   */
  loadAttachedExtensions () {
    const config = fsEx.readJsonSync(this.attachedExtensionsFile, {throws: false}) || {}
    return config.attachedExtensions || {}
  }

  /**
   * Detaches all extensions
   * @returns {AppSettings}
   */
  detachAllExtensions () {
    this._saveExtensions({})
    logger.info('Detached all extensions')
    return this
  }

  /**
   * @returns {AppJson}
   */
  _loadSettings () {
    return fsEx.readJsonSync(this.settingsFile, {throws: false}) || {}
  }

  /**
   * @returns {FrontendSettings}
   */
  getFrontendSettings () {
    return this.frontendSettings
  }
}

module.exports = AppSettings
module.exports.SETTINGS_FOLDER = SETTINGS_FOLDER
module.exports.PIPELINES_FOLDER = PIPELINES_FOLDER
module.exports.TRUSTED_PIPELINES_FOLDER = TRUSTED_PIPELINES_FOLDER
module.exports.EXTENSIONS_FOLDER = EXTENSIONS_FOLDER
module.exports.THEMES_FOLDER = THEMES_FOLDER
