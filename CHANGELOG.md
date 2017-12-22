## v1.2.0
* Set minimum node version to 8.4.0
* Improved log, so that step-logs are prefixed with the corresponding step

## v1.1.1
* Update `cloud-sdk-webpack` module to v1.5.6.

## v1.1.0
* Pipeline synchronization will now only occur every 500ms to avoid needless uploading of (unfinished) pipelines
* Errors on pipeline upload will now be more verbose
* The command sgcloud init will now exit with an error if the application does not exist as development application within the shopgate cloud system
* Better error log if a local step fails
* Fixed unhandled error exception when using unkown command options on init or login command
* Fixed hanging unit tests
* Added update check for the sdk; if outdated, any sgcloud command will show the update message
* Trusted pipelines are now supported
* The SDK will now ask the user for permission to overwrite the local application-config if a new init is executed in an existing app-folder.

## v1.0.0 - Initial Release
