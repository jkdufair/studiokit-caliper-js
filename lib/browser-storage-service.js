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

var storage = require('local-storage-fallback').default;

function BrowserStorageService() {

	var service = this;

	function getItem(key) {
		return JSON.parse(storage.getItem(key));
	}

	function setItem(key, value) {
		return storage.setItem(key, JSON.stringify(value));
	}

	function removeItem(key) {
		return storage.removeItem(key);
	}

	//
	// Public Methods
	//

	service.getItem = getItem;
	service.setItem = setItem;
	service.removeItem = removeItem;
}

module.exports = BrowserStorageService;