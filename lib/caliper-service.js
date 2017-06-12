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

var moment = require('moment');
var uuid = require('uuid');
var StandardHttpError = require('standard-http-error');
var debug = require('debug');
var logger = debug('app:caliper-service');
var errorLogger = debug('app:error');
var Caliper = require('caliperjs');
var _ = require('lodash');

function CaliperService(options) {

	var service = this;

	// Local variables
	var isInitialized = false;
	var authToken = null;
	var authTokenKey = 'studioKit:caliperService:token';

	var queue = [];
	var queueKey = 'studioKit:caliperService:queue';
	var sendPromise = null;

	var personKey = 'studioKit:caliperService:person';
	var sessionKey = 'studioKit:caliperService:session';
	var sessionExtensionsKey = 'studioKit:caliperService:sessionExtensions';
	var lastActivityDateKey = 'studioKit:caliperService:lastActivityDate';
	var lastKeepAliveDateKey = 'studioKit:caliperService:lastKeepAliveDate';

	var sessionEndTimeout;

	// Persistent objects
	var softwareApplication;
	var person;
	var session;
	var sessionExtensions;
	var lastActivityDate = null;
	var lastKeepAliveDate = null;

	// User-defined variables
	var defaults = {
		sensorId: null,
		sensorOptions: null,
		appId: null,
		appName: null,
		// functions
		getToken: null,
		// services
		storageService: null,
		// optional
		autoSend: true,
		sendInterval: 1000 * 10, // 10 seconds
		sessionIriPrefix: null,
		sessionTimeoutThreshold: 1000 * 60 * 30, // 30 minutes
		sessionKeepAliveThreshold: 1000 * 60 * 15, // 15 minutes,
		activityUpdateThreshold: 1000 * 60, // 1 minute
		onError: null
	};

	//////////////////////////////////////////////////////////////////////////////

	// called on creation of new CaliperService(...)
	// merge options with defaults, store on service
	var _options = _.merge({}, defaults, options);
	validateOptions(_options)
	initialize();

	//////////////////////////////////////////////////////////////////////////////

	//
	// Validation
	//

	function validateOptions(options) {
		// required
		if (_.isNil(options.sensorId) || !_.isString(options.sensorId)) {
			throw new Error('`options.sensorId` is required');
		}
		if (_.isNil(options.sensorOptions) || !_.isPlainObject(options.sensorOptions)) {
			throw new Error('`options.sensorOptions` is required');
		}
		if (_.isNil(options.appId) || !_.isString(options.appId)) {
			throw new Error('`options.appId` is required');
		}
		if (_.isNil(options.appName) || !_.isString(options.appName)) {
			throw new Error('`options.appName` is required');
		}
		if (_.isNil(options.getToken) || !_.isFunction(options.getToken)) {
			throw new Error('`options.getToken` is required');
		}
		if (_.isNil(options.storageService)) {
			throw new Error('`options.storageService` is required');
		}
		if (_.isNil(options.storageService.getItem) || !_.isFunction(options.storageService.getItem)) {
			throw new Error('`options.storageService.getItem(key)` function is required');
		}
		if (_.isNil(options.storageService.setItem) || !_.isFunction(options.storageService.setItem)) {
			throw new Error('`options.storageService.setItem(key, value)` function is required');
		}
		if (_.isNil(options.storageService.removeItem) || !_.isFunction(options.storageService.removeItem)) {
			throw new Error('`options.storageService.removeItem(key)` function is required');
		}
		// optional
		if (!_.isBoolean(options.autoSend)) {
			throw new Error('`options.autoSend` must be a boolean');
		}
		if (!_.isFinite(options.sendInterval)) {
			throw new Error('`options.sendInterval` must be a number');
		}
		if (!_.isNil(options.sessionIriPrefix) && (!_.isString(options.sessionIriPrefix) || options.sessionIriPrefix.length === 0)) {
			throw new Error('`options.sessionIriPrefix` must be a string');
		}
		if (!_.isFinite(options.sessionTimeoutThreshold)) {
			throw new Error('`options.sessionTimeoutThreshold` must be a number');
		}
		if (!_.isFinite(options.sessionKeepAliveThreshold)) {
			throw new Error('`options.sessionKeepAliveThreshold` must be a number');
		}
		if (!_.isFinite(options.activityUpdateThreshold)) {
			throw new Error('`options.activityUpdateThreshold` must be a number');
		}
		if (!_.isNil(options.onError) && !_.isFunction(options.onError)) {
			throw new Error('`options.onError` must be a function');
		}
	}

	//
	// Initialization
	//

	/**
	 * Initializes the service
	 */
	function initialize() {
		setSoftwareApplication(_options.appId, _options.appName);
		loadSavedData();

		initializeSensor();
		initializeQueue();
		isInitialized = true;
		logger('initialized');

		handleSavedSession();
		addActivityListeners();
		startAutoSendInterval();
	}

	/**
	 * Initializes the Caliper Sensor
	 */
	function initializeSensor() {
		Caliper.Sensor.initialize(_options.sensorId, _options.sensorOptions);
	}

	/**
	 * Initializes the Queue
	 */
	function initializeQueue() {
		queue = _options.storageService.getItem(queueKey) || [];
		_options.storageService.setItem(queueKey, queue);
	}

	/**
	 * Load saved Data
	 */
	function loadSavedData() {
		authToken = _options.storageService.getItem(authTokenKey) || null;
		person = _options.storageService.getItem(personKey) || null;
		session = _options.storageService.getItem(sessionKey) || null;
		sessionExtensions = _options.storageService.getItem(sessionExtensionsKey) || null;
		lastKeepAliveDate = _options.storageService.getItem(lastKeepAliveDateKey) || null;
		lastActivityDate = _options.storageService.getItem(lastActivityDateKey)
			// backwards compatible with v1.0.10
			||
			_options.storageService.getItem('studioKit:caliperService:sessionPauseDate') ||
			null;
	}

	/**
	 * Handle a saved Session. 
	 * 1. Clears the Session if there is not enough saved data.
	 * 2. Resumes the Session if it exists and is within the timeout threshold.
	 * 3. Ends the Session (if any) and starts a new Session if it is beyond the timeout threshold.
	 */
	function handleSavedSession() {
		// clear saved data if not all required items are found
		if (_.isNil(person) || _.isNil(lastActivityDate)) {
			logger('handleSavedSession', 'clear saved session');
			clearSession();
			clearSessionExtensions();
			clearPerson();
			clearLastActivityDate();
			clearLastKeepAliveDate();
			return;
		}

		// resume session
		if (!_.isNil(session) && moment().diff(moment(lastActivityDate)) <= _options.sessionTimeoutThreshold) {
			logger('handleSavedSession', 'lastActivityDate within sessionTimeoutThreshold, resume session');
			// trigger activity to start session timer
			onActivity();
			return;
		}

		logger('handleSavedSession', 'lastActivityDate past sessionTimeoutThreshold, start new session');

		// end previous session as a time out (if any)
		if (!_.isNil(session)) {
			endSession(lastActivityDate, true);
		}

		// start new session, with extensions (if any)
		startSession(sessionExtensions);
	}

	function setSessionExtensions(extensions) {
		sessionExtensions = extensions;
		_options.storageService.setItem(sessionExtensionsKey, sessionExtensions);
	}

	function setLastKeepAliveDate(isoString) {
		lastKeepAliveDate = isoString;
		_options.storageService.setItem(lastKeepAliveDateKey, lastKeepAliveDate);
	}

	function setLastActivityDate(isoString) {
		logger('setLastActivityDate', isoString);
		lastActivityDate = isoString;
		_options.storageService.setItem(lastActivityDateKey, lastActivityDate);
	}

	function clearPerson() {
		person = null;
		_options.storageService.setItem(personKey, null);
	}

	function clearSession() {
		session = null;
		_options.storageService.setItem(sessionKey, null);
	}

	function clearSessionExtensions() {
		sessionExtensions = null;
		_options.storageService.setItem(sessionExtensionsKey, null);
	}

	function clearLastKeepAliveDate() {
		lastKeepAliveDate = null;
		_options.storageService.setItem(lastKeepAliveDateKey, null);
	}

	function clearLastActivityDate() {
		lastActivityDate = null;
		_options.storageService.setItem(lastActivityDateKey, null);
	}

	//
	// EventStore OAuth Token
	//

	function updateSensorToken(token) {
		var headers = _options.sensorOptions.headers || {};

		// create new authorization header
		var authorization = 'Bearer ' + token.accessToken;

		// stop if authorization has not changed
		if (headers.Authorization && headers.Authorization === authorization) {
			return;
		}

		// update authorization
		headers.Authorization = authorization;
		_options.sensorOptions.headers = headers;

		// update Caliper Sensor, just resets the HTTP request options
		initializeSensor();
	}

	function hasAuthToken() {
		return authToken !== null;
	}

	function isAuthTokenExpired() {
		var expiresDate = new Date(authToken.expires);
		return expiresDate < Date.now();
	}

	function getAuthToken() {
		return _options.getToken()
			.then(function(token) {
				if (_.isNil(token)) {
					throw new Error('Error with `getToken` response: A response is required.');
				}
				if (_.isNil(token.accessToken)) {
					throw new Error('Error with `getToken` response: `token.accessToken` is required.');
				}
				if (_.isNil(token.expires)) {
					throw new Error('Error with `getToken` response: `token.expires` is required.');
				}
				logger('GET Caliper EventStore Token Success', token);
				_options.storageService.setItem(authTokenKey, token);
				authToken = token;
				updateSensorToken(authToken);
				return authToken;
			})
			.catch(function(error) {
				errorLogger('GET Caliper EventStore Token Error', error);
				_options.storageService.removeItem(authTokenKey);
				authToken = null;
				throw error;
			});
	}

	function getOrRefreshAuthToken() {
		return new Promise(function(resolve, reject) {
			if (hasAuthToken() && !isAuthTokenExpired()) {
				updateSensorToken(authToken);
				resolve(authToken);
			} else {
				getAuthToken()
					.then(resolve)
					.catch(reject);
			}
		});
	}

	function addToQueue(item) {
		if (_.isNil(item)) {
			throw new Error('`item` is required');
		}
		queue.push(item);
		options.storageService.setItem(queueKey, queue);
	}

	/**
	 * Send events to the EventStore
	 * @param {number} maxItems The maximum number of items to send at once. -1 will send the entire queue.
	 */
	function send(maxItems) {
		maxItems = maxItems || -1;
		if (!_.isNumber(maxItems) || maxItems < -1) {
			return Promise.reject(new Error('maxItems must be a number, -1 or greater.'));
		}
		if (sendPromise !== null) {
			return Promise.reject(new Error('Cannot send. Service is already sending a request.'));
		}
		if (queue.length === 0) {
			return Promise.resolve();
		}

		// convert constant of -1 to the actual current queue length
		if (maxItems === -1) {
			maxItems = queue.length;
		}
		// get events to send
		var itemsToSend = _.take(queue, maxItems);
		logger('Sending Caliper Items...', itemsToSend);

		sendPromise = getOrRefreshAuthToken()
			.catch(function(error) {
				errorLogger('Caliper Token Error', error);
				sendPromise = null;
				if (!_.isNil(options.onError)) {
					_options.onError(error);
				}
				throw error;
			})
			.then(function() {
				return Caliper.Sensor.send(itemsToSend)
					.then(function(response) {
						logger('Caliper Items Saved', response);
						// remove the saved items from the queue
						queue = _.difference(queue, itemsToSend);
						options.storageService.setItem(queueKey, queue);
						sendPromise = null;
					}).catch(function(error) {
						if (error instanceof StandardHttpError) {
							if (error.code === 401) {
								// clear auth token for an Unauthorized response
								options.storageService.removeItem(authTokenKey);
								authToken = null;
							} else if (error.code === 400) {
								// remove failed items for a Bad Request response
								queue = _.difference(queue, itemsToSend);
								options.storageService.setItem(queueKey, queue);
							}
						}
						errorLogger('Caliper Error', error);
						sendPromise = null;
						if (!_.isNil(options.onError)) {
							_options.onError(error);
						}
						throw error;
					});
			});

		return sendPromise;
	}

	//
	// Auto Send
	//

	function startAutoSendInterval() {
		if (!_options.autoSend) {
			return;
		}
		setInterval(function() {
			service.send()
				.catch(function() {
					// options.onError will receive all errors
				});
		}, _options.sendInterval);
	}

	//
	// Session Activity
	//

	function onActivity(e) {
		var now = moment();

		// limit updates to once per minute
		if (now.diff(moment(lastActivityDate)) < _options.activityUpdateThreshold) {
			return;
		}

		logger('onActivity', e);

		var didStartSession = false;
		if (_.isNil(session) && !_.isNil(person)) {
			// start new session, with extensions (if any)
			startSession(sessionExtensions);
			didStartSession = true;
		}

		// save date of activity
		setLastActivityDate(now.toISOString());

		// update timer and keep-alive
		if (!_.isNil(session) && !didStartSession) {
			// restart session end timeout
			startSessionEndTimeout();

			// send keep alive session, limited to once per threshold
			if (now.diff(moment(lastKeepAliveDate)) >= _options.sessionKeepAliveThreshold) {
				keepAliveSession();
			}
		}
	}

	function addActivityListeners() {
		/*eslint no-undef: "error"*/
		/*eslint-env browser*/
		if (typeof window === 'undefined') {
			return;
		}
		window.addEventListener('click', onActivity);
		window.addEventListener('mousemove', onActivity);
		window.addEventListener('keydown', onActivity);
		window.addEventListener('keypress', onActivity);
		window.addEventListener('keyup', onActivity);
		window.addEventListener('blur', onActivity);
		window.addEventListener('focus', onActivity);
		window.addEventListener('touchstart', onActivity);
		window.addEventListener('touchmove', onActivity);
		window.addEventListener('touchend', onActivity);
		window.addEventListener('touchcancel', onActivity);
		window.addEventListener('scroll', onActivity);
		window.addEventListener('wheel', onActivity);
		window.addEventListener('beforeunload', onActivity);
	}

	function isMediaPlaying() {
		/*eslint no-undef: "error"*/
		/*eslint-env browser*/
		if (typeof document === 'undefined') {
			return false;
		}
		var isVideoPlaying = Array.prototype.slice.call(document.getElementsByTagName('video'))
			.some(function(video) {
				return video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2;
			});
		var isAudioPlaying = Array.prototype.slice.call(document.getElementsByTagName('audio'))
			.some(function(audio) {
				return audio.currentTime > 0 && !audio.paused && !audio.ended && audio.readyState > 2;
			});
		return isVideoPlaying || isAudioPlaying;
	}

	function startSessionEndTimeout() {
		clearSessionEndTimeout();
		logger('startSessionEndTimeout');
		sessionEndTimeout = setTimeout(function() {
			if (service.isMediaPlaying()) { // call service method to enable test stubs
				logger('media is playing');
				onActivity();
				return;
			}
			// end session, timed out
			endSession(lastActivityDate, true);
		}, _options.sessionTimeoutThreshold);
	}

	function clearSessionEndTimeout() {
		logger('clearSessionEndTimeout');
		if (!_.isNil(sessionEndTimeout)) {
			clearTimeout(sessionEndTimeout);
		}
		sessionEndTimeout = null;
	}

	//
	// Caliper Actions
	//

	function setSoftwareApplication(id, name) {
		// no need to validate params, validateOptions handles this
		softwareApplication = new Caliper.Entities.SoftwareApplication(id);
		softwareApplication.name = name;
		logger('setSoftwareApplication', softwareApplication);
	}

	function setPerson(id, firstName, lastName, extensions) {
		if (_.isNil(id) || _.isNil(firstName) || _.isNil(lastName)) {
			throw new Error('`id`, `firstName`, `lastName` are required');
		}
		if (!_.isNil(extensions) && !_.isPlainObject(extensions)) {
			throw new Error('Cannot set Person: `extensions` must be a plain object.');
		}
		// allow person to be updated, but not changed if session is in progress
		if (!_.isNil(person) && !_.isNil(session) && person['@id'] !== id) {
			throw new Error('Cannot change Person: `person` and `session` are already defined. You must call `endSession()` first.');
		}

		person = new Caliper.Entities.Person(id);
		person.name = firstName + ' ' + lastName;
		if (!_.isNil(extensions)) {
			person.extensions = extensions;
		}
		logger('setPerson', person);

		// save Person to storageService
		_options.storageService.setItem(personKey, person);
	}

	function startSession(extensions) {
		if (!_.isNil(session)) {
			logger('Session already started, skipping `startSession` method.');
			return;
		}

		if (_.isNil(person)) {
			throw new Error('Cannot start Session: `person` is not defined. You must call `setPerson()` first.');
		}
		if (!_.isNil(extensions) && !_.isPlainObject(extensions)) {
			throw new Error('Cannot start Session: `extensions` must be a plain object.');
		}

		// create Session
		var nowISOString = moment().toISOString();
		var sessionId = uuid.v4();
		session = new Caliper.Entities.Session((_options.sessionIriPrefix || softwareApplication['@id']) + '/session/' + sessionId);
		session.name = 'session-' + sessionId;
		session.actor = person;
		session.startedAtTime = nowISOString;
		session.dateCreated = nowISOString;
		session.dateModified = nowISOString;

		if (!_.isNil(extensions)) {
			session.extensions = extensions;
			setSessionExtensions(extensions);
		}

		// create Event
		var event = new Caliper.Events.SessionEvent();
		event.setActor(person);
		event.setAction(Caliper.Actions.SessionActions.LOGGED_IN);
		event.setObject(softwareApplication);
		event.setGenerated(session);
		event.setEventTime(nowISOString);
		event.setEdApp(softwareApplication);

		// add Event to queue
		logger('startSession', event);
		addToQueue(event);

		// save Session to storageService
		_options.storageService.setItem(sessionKey, session);

		// save date to storageService so keep alive always has a starting point
		setLastKeepAliveDate(nowISOString);

		// trigger activity to start session timer
		onActivity();
	}

	function keepAliveSession() {
		if (_.isNil(session)) {
			throw new Error('Cannot keep alive Session: `session` is not defined. You must call `startSession()` first.');
		}

		// update Session
		var nowISOString = moment().toISOString();
		session.dateModified = nowISOString;

		// only send minimal object, reduce payload size
		var minSession = {
			'@context': session['@context'],
			'@id': session['@id'],
			'@type': session['@type'],
			dateModified: session.dateModified
		};

		// add Session to queue
		logger('keepAliveSession', minSession);
		addToQueue(minSession);

		// save date to storageService
		setLastKeepAliveDate(nowISOString);
	}

	/**
	 * Ends the Session in progress.
	 * @param {string} endedAtTime The ISO Date string when the Session ended. By default, the current moment is used.
	 * @param {boolean} didTimeOut Whether or not the Session timed out. By default, the SessionEvent's action will be LOGGED_OUT.
	 */
	function endSession(endedAtTime, didTimeOut) {
		if (_.isNil(person)) {
			throw new Error('Cannot end Session: `person` is not defined. You must call `setPerson()` first.');
		}
		if (_.isNil(session)) {
			throw new Error('Cannot end Session: `session` is not defined. You must call `startSession()` first.');
		}

		// end Session
		endedAtTime = endedAtTime || moment().toISOString();
		didTimeOut = didTimeOut || false;

		session.endedAtTime = endedAtTime;
		session.dateModified = endedAtTime;

		// create Event
		var event = new Caliper.Events.SessionEvent();
		var actor = didTimeOut ? softwareApplication : person;
		var action = didTimeOut ? Caliper.Actions.SessionActions.TIMED_OUT : Caliper.Actions.SessionActions.LOGGED_OUT;
		event.setActor(actor);
		event.setAction(action);
		event.setObject(session);
		event.setEventTime(endedAtTime);
		event.setEdApp(softwareApplication);

		// add Event to queue
		logger('endSession', event);
		addToQueue(event);

		clearSession();
		clearLastKeepAliveDate();
		clearSessionEndTimeout();

		if (!didTimeOut) {
			clearLastActivityDate();
			clearPerson();
			clearSessionExtensions();
		}
	}

	//
	// Public Methods
	//

	service.isInitialized = function() {
		return isInitialized;
	};
	service.getOrRefreshAuthToken = getOrRefreshAuthToken;
	service.addToQueue = addToQueue;
	service.send = send;
	service.onActivity = onActivity;
	service.isMediaPlaying = isMediaPlaying;
	service.setPerson = setPerson;
	service.startSession = startSession;
	service.keepAliveSession = keepAliveSession;
	service.endSession = endSession;
}

module.exports = CaliperService;
