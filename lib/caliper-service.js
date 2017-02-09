var moment = require('moment');
var uuid = require('uuid');
var debug = require('debug');
var logger = debug('CaliperService');
var errorLogger = debug('app:error');
var Caliper = require('caliperjs');

function CaliperService(id, options, getToken, storageService) {

	var service = this;

	// Local variables
	var initialized = false;
	var authToken = null;
	var authTokenKey = 'caliperService:token';
	var queue = [];
	var queueKey = 'caliperService:queue';
	var busy = false;

	// Persistent objects
	var softwareApplication;
	var person;
	var session;

	// User-defined variables
	var sensorId;
	var sensorOptions;
	var getTokenAction = function() {
		throw new Error('getTokenAction not implemented');
	};
	var storage = {
		get: function() {
		},
		set: function() {
		},
		remove: function() {
		}
	};

	//////////////////////////////////////////////////////////////////////////////

	// called on creation of new CaliperService(...)
	initialize(id, options, getToken, storageService);

	//////////////////////////////////////////////////////////////////////////////

	//
	// Initialization
	//

	/**
	 * Initializes the service
	 * @param options - Options in the form of Options.js
	 * @param getToken - A function that can be called to retrieve the EventStore accessToken. Should return a Promise. e.g. fetch() or $http.get()
	 * @param getToken - A function that can be called to retrieve the EventStore accessToken. Should return a Promise. e.g. fetch() or $http.get()
	 */
	function initialize(id, options, getToken, storageService) {

		if (typeof id === 'undefined' || !id) {
			throw new Error('`id is required');
		}
		if (typeof options === 'undefined' || !options) {
			throw new Error('`options` is required');
		}
		if (typeof getToken === 'undefined' || !getToken) {
			throw new Error('`getToken` is required');
		}

		getTokenAction = getToken;
		storage = storageService || storage;

		// Caliper Sensor
		sensorId = id;
		sensorOptions = options;
		Caliper.Sensor.initialize(sensorId, sensorOptions);

		// setup a storage queue
		queue = storage.get(queueKey) || [];
		storage.set(queueKey, queue);

		// load saved authToken
		authToken = storage.get(authTokenKey) || null;

		initialized = true;
		logger('initialized');
	}

	//
	// EventStore OAuth Token
	//

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

	function getAuthToken() {
		return getTokenAction()
			.then(function(token) {
				logger('GET Caliper EventStore Token Success', token);
				storage.set(authTokenKey, token);
				authToken = token;
				updateSensorToken(authToken);
			})
			.catch(function(error) {
				errorLogger('GET Caliper EventStore Token Error', error);
				storage.remove(authTokenKey);
				authToken = null;
				throw error;
			});
	}

	function updateSensorToken(token) {
		var headers = sensorOptions.headers || {};
		headers.Authorization = 'Bearer ' + token.accessToken;
		sensorOptions.headers = headers;

		// update Caliper Sensor
		Caliper.Sensor.initialize(sensorId, sensorOptions);
	}

	function queueEvent(entry) {
		if (entry === null) {
			return;
		}
		queue.push(entry);
		storage.set(queueKey, queue);
	}

	function sendQueue() {
		if (busy || !initialized) {
			return;
		}

		if (queue.length === 0) {
			return;
		}

		busy = true;
		logger('Sending Caliper Events...', queue);
		return getOrRefreshAuthToken()
			.catch(function(error) {
				errorLogger('Caliper Token Error', error);
				busy = false;
				throw error;
			})
			.then(function() {
				return Caliper.Sensor.send(queue)
					.then(function(response) {
						logger('Caliper Events Saved', response);
						queue = [];
						storage.set(queueKey, queue);
						busy = false;
					}).catch(function(error) {
						errorLogger('Caliper Error', error);
						busy = false;
						throw error;
					});
			});
	}

	//
	// Public Methods
	//

	service.initialized = function() {
		return initialized;
	}

	service.getOrRefreshAuthToken = getOrRefreshAuthToken;

	service.sendQueue = sendQueue;

	service.setSoftwareApplication = function(id, name) {
		if (typeof id === 'undefined' || !id || typeof name === 'undefined' || !name) {
			throw new Error('`id` and `name` required');
		}
		softwareApplication = new Caliper.Entities.SoftwareApplication(id);
		softwareApplication.name = name;
		logger('setSoftwareApplication', softwareApplication);
	};

	service.setPerson = function(id, firstName, lastName) {
		if (!id || typeof id === 'undefined' || !firstName || typeof firstName === 'undefined' || !lastName || typeof lastName === 'undefined') {
			throw new Error('`id`, `firstName`, `lastName` are required');
		}
		person = new Caliper.Entities.Person(id);
		person.name = firstName + ' ' + lastName;
		logger('setPerson', person);
	};

	service.startSession = function(extensions) {
		if (!initialized) {
			throw new Error('Cannot start Session: service is not initialized. You must call `initialize()` first.');
		}
		if (!softwareApplication || typeof softwareApplication === 'undefined') {
			throw new Error('Cannot start Session: `softwareApplication` is not defined. You must call `setSoftwareApplication()` first.');
		}
		if (!person || typeof person === 'undefined') {
			throw new Error('Cannot start Session: `person` is not defined. You must call `setPerson()` first.');
		}
		if (session) {
			throw new Error('Cannot start Session: `session` already defined. You must call `endSession()` to end the current session before starting a new one.');
		}

		// create Session
		var nowISOString = moment().toISOString();
		var sessionId = uuid.v4();
		session = new Caliper.Entities.Session(sessionId);
		session.name = 'session-' + sessionId;
		session.actor = person;
		session.startedAtTime = nowISOString;
		session.dateCreated = nowISOString;
		session.dateModified = nowISOString;

		if (extensions) {
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
		queueEvent(event);
	};

	service.endSession = function() {
		if (!initialized) {
			throw new Error('Cannot start Session: service is not initialized. You must call `initialize()` first.');
		}
		if (!softwareApplication || typeof softwareApplication === 'undefined') {
			throw new Error('Cannot end Session: `softwareApplication` is not defined. You must call `setSoftwareApplication()` first.');
		}
		if (!person || typeof person === 'undefined') {
			throw new Error('Cannot end Session: `person` is not defined. You must call `setPerson()` first.');
		}
		if (!session || typeof session === 'undefined') {
			throw new Error('Cannot end Session: `session` is not defined. You must call `startSession()` first.');
		}

		// end Session
		var nowISOString = moment().toISOString();
		session.endedAtTime = nowISOString;

		// create Event
		var event = new Caliper.Events.SessionEvent();
		event.setActor(person);
		event.setAction(Caliper.Actions.SessionActions.LOGGED_OUT);
		event.setObject(session);
		event.setEventTime(nowISOString);
		event.setEdApp(softwareApplication);

		// add Event to queue
		logger('endSession', event);
		queueEvent(event);
	};
}

module.exports = CaliperService;
