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
	var lastActivityDateKey = 'studioKit:caliperService:lastActivityDate';
	var lastKeepAliveDateKey = 'studioKit:caliperService:lastKeepAliveDate';
	
	var sessionEndTimeout;

	// Persistent objects
	var softwareApplication;
	var person;
	var session;
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
		sessionEndThreshold:  1000 * 60 * 30, // 30 minutes
		sessionKeepAliveThreshold: 1000 * 60 * 15, // 15 minutes
		onError: function(err) {
			console.error(err);
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
		if (!_.isFinite(options.sessionEndThreshold)) {
			throw new Error('`options.sessionEndThreshold` must be a number');
		}
		if (!_.isFinite(options.sessionKeepAliveThreshold)) {
			throw new Error('`options.sessionKeepAliveThreshold` must be a number');
		}
		if (!_.isFunction(options.onError)) {
			throw new Error('`options.onError` function is required');
		}
	}

	function checkIsInitialized() {
		if (!isInitialized) {
			throw new Error('Service is not initialized.');
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
		loadSavedLastActivityDate();
		loadSavedPerson();
		loadSavedSession();
		loadSavedAuth();

		initializeSensor();
		initializeQueue();
		isInitialized = true;
		logger('initialized');

		handleSavedSession();
		addActivityListeners();
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
	 * Load saved Last Activity Date
	 */
	function loadSavedLastActivityDate() {
		lastActivityDate = _options.storageService.getItem(lastActivityDateKey)
			// backwards compatible with v1.0.10
			|| _options.storageService.getItem('studioKit:caliperService:sessionPauseDate') 
			|| null;
	}

	/**
	 * Load saved Person
	 */
	function loadSavedPerson() {
		person = _options.storageService.getItem(personKey) || null;
	}

	/**
	 * Load saved Session
	 */
	function loadSavedSession() {
		session = _options.storageService.getItem(sessionKey) || null;
	}

	/**
	 * Handle a saved Session. 
	 * 1. Clears the Session if it cannot resume or end.
	 * 2. Resumes the Session if it is within the timeout threshold.
	 * 3. Ends the Session and starts a new Session if it is beyond the timeout threshold.
	 */
	function handleSavedSession() {
		// clear saved data if not all required items are found
		if (_.isNil(session) || _.isNil(person) || _.isNil(lastActivityDate)) {
			clearSavedSession();
			clearSavedPerson();
			return;
		}

		// resume session
		if (moment().diff(moment(lastActivityDate)) <= _options.sessionTimeoutThreshold) {
			startSessionEndTimeout();
			return;
		}

		// close previous session
		// persist person, session.extensions
		var extensionsCopy = session.extensions;
		var personCopy = person;
		endSession(lastActivityDate);

		// endSession clears the person, reset it
		person = personCopy;
		startSession(extensionsCopy);
	}

	function clearSavedPerson() {
		person = null;
		_options.storageService.setItem(personKey, null);
	}

	function clearSavedSession() {
		session = null;
		_options.storageService.setItem(sessionKey, null);
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
				_options.onError(error);
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
						_options.onError(error);
						throw error;
					});
			});

		return sendPromise;
	}

	//
	// Auto Send
	//

	function autoSend() {
		if (!_options.autoSend) {
			return;
		}
		return send()
			.then(function() {
				startAutoSendTimeout();
				return true;
			})
			.catch(function() {
				startAutoSendTimeout();
				return false;
			});
	}

	function startAutoSendTimeout() {
		if (!_options.autoSend) {
			return;
		}
		setTimeout(autoSend, _options.sendInterval);
	}

	//
	// Session Activity
	//

	function onActivity() {
		var now = moment();

		// limit updates to once per minute
		if (now.diff(moment(lastActivityDate)) < (1000 * 60)) {
			return;
		}

		// save date of activity
		lastActivityDate = now.toISOString();
		_options.storageService.setItem(lastActivityDateKey, lastActivityDate);
		console.log('active date updated');

		// restart session end timeout
		startSessionEndTimeout();

		// send keep alive session, limited to once per threshold
		if (!_.isNil(session) && now.diff(moment(lastKeepAliveDate)) >= _options.sessionKeepAliveThreshold) {
			keepAliveSession();
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

	function startSessionEndTimeout() {
		clearSessionEndTimeout();
		sessionEndTimeout = setTimeout(function() {
			endSession(lastActivityDate);
		}, _options.sessionEndThreshold);
	}

	function clearSessionEndTimeout() {
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
		checkIsInitialized();

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
		checkIsInitialized();

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

		// trigger update activity date and start session end timeout
		onActivity();
		startSessionEndTimeout();
	}

	function keepAliveSession() {
		checkIsInitialized();

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

	function endSession(endedAtTime) {
		checkIsInitialized();

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

		clearSavedSession();
		clearSavedPerson();
		clearSessionEndTimeout();
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
	service.setPerson = setPerson;
	service.startSession = startSession;
	service.endSession = endSession;
}

module.exports = CaliperService;
