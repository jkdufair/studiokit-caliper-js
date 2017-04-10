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
	var sessionKeepAliveTimeout;
	var sessionKeepAliveInterval;
	var lastKeepAliveDate = null;
	var lastKeepAliveDateKey = 'studioKit:caliperService:lastKeepAliveDate';
	var personKey = 'studioKit:caliperService:person';
	var sessionKey = 'studioKit:caliperService:session';
	var sessionPauseDate = null;
	var sessionPauseDateKey = 'studioKit:caliperService:sessionPauseDate';

	// Persistent objects
	var softwareApplication;
	var person;
	var session;

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
		autoKeepAliveSession: true,
		sessionKeepAliveInterval: 1000 * 60 * 15,  // 15 minutes
		sessionPauseThreshold: 1000 * 60, // 1 minute
		onError: function(err) {
			console.error(err);
		},
		isEnabled: function() {
			return true;
		},
		isGetTokenAuthorized: function() {
			return true;
		}
	};

	//////////////////////////////////////////////////////////////////////////////

	// called on creation of new CaliperService(...)
	// merge options with defaults, store on service
	var _options = _.merge({}, defaults, options);
	validateOptions(_options)
	initialize();

	//////////////////////////////////////////////////////////////////////////////

	//
	// Initialization
	//

	function validateOptions(options) {
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
	}

	/**
	 * Initializes the service
	 */
	function initialize() {
		initializeSensor();
		initializeQueue();
		loadSavedAuth();
		setSoftwareApplication(_options.appId, _options.appName);

		isInitialized = true;
		logger('initialized');

		loadSavedSession();
		addPauseSessionListener();
		startAutoSendTimeout();
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
	 * Load saved Auth Token
	 */
	function loadSavedAuth() {
		authToken = _options.storageService.getItem(authTokenKey) || null;
	}

	/**
	 * Load saved Session and initialize
	 *
	 */
	function loadSavedSession() {
		// session
		session = _options.storageService.getItem(sessionKey) || null;

		// session end date
		sessionPauseDate = _options.storageService.getItem(sessionPauseDateKey) || null;

		// person
		person = _options.storageService.getItem(personKey) || null;

		// require all saved session items to proceed
		if (session === null || sessionPauseDate === null || person === null) {
			clearSavedSession();
			clearSavedPerson();
			return;
		}

		// resuming session within threshold
		if (moment().diff(moment(sessionPauseDate)) <= _options.sessionPauseThreshold) {

			// start keep alive timeout based on how much time is left from previous interval
			if (_options.autoKeepAliveSession) {
				// keep alive
				lastKeepAliveDate = _options.storageService.getItem(lastKeepAliveDateKey) || null;
				var keepAliveDiff = lastKeepAliveDate !== null
					? moment().diff(moment(lastKeepAliveDate))
					: 0;
				var keepAliveTimeout = _options.sessionKeepAliveInterval - keepAliveDiff;
				logger('restart keep alive', keepAliveTimeout);
				sessionKeepAliveTimeout = setTimeout(function() {
					keepAliveSession();
					startKeepAliveInterval();
				}, keepAliveTimeout);
			}

		} else {
			// copy extensions from previous session
			var extensions = session.extensions;
			endSession(sessionPauseDate);
			startSession(extensions);
		}
	}

	function clearSavedPerson() {
		person = null;
		_options.storageService.setItem(personKey, null);
	}

	function clearSavedSession() {
		session = sessionPauseDate = null;
		_options.storageService.setItem(sessionKey, null);
		_options.storageService.setItem(sessionPauseDateKey, null);
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
		if (!hasAuthToken()) {
			return false;
		}
		var expiresDate = new Date(authToken.expires);
		return expiresDate < Date.now();
	}

	function getAuthToken() {
		return _options.getToken()
			.then(function(token) {
				if (_.isNil(token)) {
					throw new Error('`token` is required');
				}
				if (_.isNil(token.accessToken)) {
					throw new Error('`token.accessToken` is required');
				}
				if (_.isNil(token.expires)) {
					throw new Error('`token.expires` is required');
				}
				logger('GET Caliper EventStore Token Success', token);
				_options.storageService.setItem(authTokenKey, token);
				authToken = token;
				updateSensorToken(authToken);
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
	 * @param maxEvents - maximum number of events to send at once. -1 will send the entire queue.
	 */
	function send(maxEvents) {
		maxEvents = maxEvents || -1;
		if (!_.isNumber(maxEvents) || maxEvents < -1) {
			return Promise.reject(new Error('maxEvents must be a number, -1 or greater.'));
		}
		if (!isInitialized) {
			return Promise.reject(new Error('Cannot send. Service is not initialized.'));
		}
		if (sendPromise !== null) {
			return Promise.reject(new Error('Cannot send. Service is already sending a request.'));
		}
		if (queue.length === 0) {
			return Promise.resolve();
		}

		// convert constant of -1 to the actual current queue length
		if (maxEvents === -1) {
			maxEvents = queue.length;
		}
		// get events to send
		var eventsToSend = _.take(queue, maxEvents);
		logger('Sending Caliper Events...', eventsToSend);

		sendPromise = getOrRefreshAuthToken()
			.catch(function(error) {
				errorLogger('Caliper Token Error', error);
				sendPromise = null;
				throw error;
			})
			.then(function() {
				return Caliper.Sensor.send(eventsToSend)
					.then(function(response) {
						logger('Caliper Events Saved', response);
						// remove the saved events from the queue
						queue = _.difference(queue, eventsToSend);
						options.storageService.setItem(queueKey, queue);
						sendPromise = null;
					}).catch(function(error) {
						if (error instanceof StandardHttpError) {
							if (error.code === 401) {
								// clear auth token for an Unauthorized response
								options.storageService.removeItem(authTokenKey);
								authToken = null;
							} else if (error.code === 400) {
								// remove failed events for a Bad Request response
								queue = _.difference(queue, eventsToSend);
								options.storageService.setItem(queueKey, queue);
							}
						}
						errorLogger('Caliper Error', error);
						sendPromise = null;
						throw error;
					});
			});

		return sendPromise;
	}

	//
	// Auto Keep Alive Session
	//

	function startKeepAliveInterval() {
		if (_options.autoKeepAliveSession) {
			sessionKeepAliveInterval = setInterval(keepAliveSession, _options.sessionKeepAliveInterval);
		}
	}

	//
	// Auto Send
	//

	function startAutoSendTimeout() {
		if (_options.autoSend) {
			setTimeout(trySend, _options.sendInterval);
		}
	}

	//
	// Auto Pause Session
	//

	function addPauseSessionListener() {
		/*eslint no-undef: "error"*/
		/*eslint-env browser*/
		if (typeof window === 'undefined') {
			return;
		}
		if (window.addEventListener) {
			window.addEventListener('beforeunload', tryPauseSession);
		} else {
			window.onbeforeunload = tryPauseSession;
		}
	}

	//
	// Caliper Actions
	//

	function checkInitializedAndThrow() {
		if (!isInitialized) {
			throw new Error('Service is not initialized.');
		}
		if (!_options.isEnabled()) {
			throw new Error('Service is not enabled. `options.isEnabled()` returned `false`.');
		}
		if (!_options.isGetTokenAuthorized()) {
			throw new Error('Service is not authorized. `options.isGetTokenAuthorized()` returned `false`.');
		}
	}

	function setSoftwareApplication(id, name) {
		if (_.isNil(id) || _.isNil(name)) {
			throw new Error('`id` and `name` required');
		}
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
		checkInitializedAndThrow();

		if (_.isNil(softwareApplication)) {
			throw new Error('Cannot start Session: `softwareApplication` is not defined. You must call `setSoftwareApplication()` first.');
		}
		if (_.isNil(person)) {
			throw new Error('Cannot start Session: `person` is not defined. You must call `setPerson()` first.');
		}
		if (!_.isNil(session)) {
			throw new Error('Cannot start Session: `session` already defined. You must call `endSession()` to end the current session before starting a new one.');
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
		_options.storageService.setItem(lastKeepAliveDateKey, nowISOString);

		// start keep alive interval
		startKeepAliveInterval();
	}

	function keepAliveSession() {
		checkInitializedAndThrow();

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
		_options.storageService.setItem(lastKeepAliveDateKey, nowISOString);
	}

	function pauseSession() {
		checkInitializedAndThrow();

		if (_.isNil(session)) {
			throw new Error('Cannot pause Session: `session` is not defined. You must call `startSession()` first.');
		}

		// save date to storageService
		var nowISOString = moment().toISOString();
		_options.storageService.setItem(sessionPauseDateKey, nowISOString);

		logger('pauseSession', nowISOString);
	}

	function endSession(endedAtTime) {
		checkInitializedAndThrow();

		if (_.isNil(softwareApplication)) {
			throw new Error('Cannot end Session: `softwareApplication` is not defined. You must call `setSoftwareApplication()` first.');
		}
		if (_.isNil(person)) {
			throw new Error('Cannot end Session: `person` is not defined. You must call `setPerson()` first.');
		}
		if (_.isNil(session)) {
			throw new Error('Cannot end Session: `session` is not defined. You must call `startSession()` first.');
		}

		// end Session
		endedAtTime = endedAtTime || moment().toISOString();
		session.endedAtTime = endedAtTime;
		session.dateModified = endedAtTime;

		// create Event
		var event = new Caliper.Events.SessionEvent();
		event.setActor(person);
		event.setAction(Caliper.Actions.SessionActions.LOGGED_OUT);
		event.setObject(session);
		event.setEventTime(endedAtTime);
		event.setEdApp(softwareApplication);

		// add Event to queue
		logger('endSession', event);
		addToQueue(event);

		// clear session and keepAlive
		clearSavedSession();
		if (sessionKeepAliveInterval) {
			clearInterval(sessionKeepAliveInterval);
		}
		sessionKeepAliveInterval = null;
		if (sessionKeepAliveTimeout) {
			clearTimeout(sessionKeepAliveTimeout);
		}
		sessionKeepAliveTimeout = null;
	}

	//
	// Try Methods
	//

	function tryGetOrRefreshAuthToken() {
		try {
			checkInitializedAndThrow();
			getOrRefreshAuthToken()
				.catch(_options.onError);
			return true;
		} catch (err) {
			return false;
		}
	}

	function trySend() {
		try {
			checkInitializedAndThrow();
			sendPromise = send()
				.catch(_options.onError)
				.then(() => {
					sendPromise = null;
					setTimeout(trySend, _options.sendInterval);
				});
			return true;
		} catch (err) {
			sendPromise = null;
			setTimeout(trySend, _options.sendInterval);
			return false;
		}
	}

	function trySetPerson(id, firstName, lastName, extensions) {
		try {
			setPerson(id, firstName, lastName, extensions);
			return true;
		} catch (err) {
			return false;
		}
	}

	function tryStartSession(extensions) {
		try {
			startSession(extensions);
			return true;
		} catch (err) {
			return false;
		}
	}

	function tryPauseSession() {
		try {
			pauseSession();
			return true;
		} catch (err) {
			return false;
		}
	}

	function tryEndSession(endedAtTime) {
		try {
			endSession(endedAtTime);
			return true;
		} catch (err) {
			return false;
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
	service.setSoftwareApplication = setSoftwareApplication;
	service.setPerson = setPerson;
	service.startSession = startSession;
	service.endSession = endSession;

	service.tryGetOrRefreshAuthToken = tryGetOrRefreshAuthToken;
	service.trySend = trySend;
	service.trySetPerson = trySetPerson;
	service.tryStartSession = tryStartSession;
	service.tryEndSession = tryEndSession;

}

module.exports = CaliperService;
