const assert = require('assert')
const path = require('path')
const fsEx = require('fs-extra')
const utils = require('../../lib/utils/utils')

describe('utils', () => {
  describe('resetProject', () => {
    const testProjectDir = path.join('build', 'testProject')

    const settingsDir = path.join(testProjectDir, '.sgcloud')
    const ext1Dir = path.join(testProjectDir, 'extensions', 'te1', 'extension')
    const ext2Dir = path.join(testProjectDir, 'extensions', 'te2', 'extension')
    const theme1Dir = path.join(testProjectDir, 'themes', 'tt1', 'config')
    const theme2Dir = path.join(testProjectDir, 'themes', 'tt2', 'config')
    const plDir = path.join(testProjectDir, 'pipelines')
    const tplDir = path.join(testProjectDir, 'trustedPipelines')

    const dirs = [
      settingsDir,
      ext1Dir,
      ext2Dir,
      theme1Dir,
      theme2Dir,
      plDir,
      tplDir
    ]

    const appFile = path.join(settingsDir, 'app.json')
    const storageFile = path.join(settingsDir, 'storage.json')
    const extensionsFile = path.join(settingsDir, 'attachedExtension.json')
    const ext1ConfFile = path.join(ext1Dir, 'config.json')
    const ext2ConfFile = path.join(ext2Dir, 'config.json')
    const theme1AppFile = path.join(theme1Dir, 'app.json')
    const theme2AppFile = path.join(theme2Dir, 'app.json')
    const pl = path.join(plDir, 'pl.json')
    const tpl = path.join(tplDir, 'tpl.json')

    const files = [
      appFile,
      storageFile,
      extensionsFile,
      ext1ConfFile,
      ext2ConfFile,
      theme1AppFile,
      theme2AppFile,
      pl,
      tpl
    ]

    beforeEach((done) => {
      process.env.APP_PATH = testProjectDir
      dirs.forEach(dir => fsEx.ensureDirSync(dir))
      files.forEach(file => fsEx.writeJSONSync(file, {}))
      done()
    })

    afterEach((done) => {
      delete process.env.APP_PATH
      fsEx.removeSync(testProjectDir)
      done()
    })

    it('should reset the project', (done) => {
      utils.resetProject()
      setTimeout(() => {
        files.forEach(file => assert.ok(!fsEx.pathExistsSync(file), `${file} should not exists`))
        done()
      }, 1000)
    })
  })
})
