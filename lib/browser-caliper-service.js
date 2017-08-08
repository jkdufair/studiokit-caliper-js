/*
	Copyright 2017 Purdue University

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

		http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

var StandardHttpError = require('standard-http-error');
var _ = require('lodash');
var Raven = require('raven-js');
var CaliperService = require('./caliper-service');
var BrowserStorageService = require('./browser-storage-service');

/*
 * Subclass of CaliperService.
 * Uses `raven-js` for error handling and `BrowserStorageService` for storage service.
 */
function BrowserCaliperService(options) {
	// Override options
	options = mergeOptions(options);
	// Call superclass constructor
	CaliperService.call(this, options);

	//
	// Options
	//

	function onError(error) {
		if (typeof Raven === 'undefined' || !Raven.isSetup()) {
			return;
		}
		var shouldTrack = true;
		if (error instanceof StandardHttpError) {
			if (error.code === 401) {
				shouldTrack = false;
			}
		} else {
			try {
				// try to parse
				var errorJson = JSON.parse(error.message);
				if (errorJson && errorJson.status && errorJson.status === 401) {
					shouldTrack = false;
				}
			} catch (err) {
				// ignore
			}
		}
		if (shouldTrack) {
			Raven.captureException(
				error,
				error.data
					? {
							extra: {
								data: error.data
							}
						}
					: null
			);
		}
	}

	function mergeOptions(options) {
		var defaults = {
			storageService: new BrowserStorageService(),
			onError: onError
		};
		return _.merge({}, defaults, options);
	}
}
BrowserCaliperService.prototype = Object.create(CaliperService.prototype);
BrowserCaliperService.prototype.constructor = BrowserCaliperService;

module.exports = BrowserCaliperService;
