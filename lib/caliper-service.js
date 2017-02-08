var moment = require('moment');
var uuid = require('uuid');
var debug = require('debug');
var logger = debug('CaliperService');
var errorLogger = debug('app:error');
var Caliper = require('../caliper-js-public');
var Options = require('./options');

module.exports = function CaliperService(options, getToken, storageService) {

	var service = this;

	// Local variables
	var initialized = false;
	var tokenEndpoint;
	var sendInterval = 5000; // 5 seconds
	var sensorId;
	var sensorOptions;
	var authToken = null;
	var authTokenKey = 'caliperService:token';
	var queueKey = 'caliperService:queue';
	var busy = false;

	// persistent objects
	var softwareApplication;
	var person;
	var session;

	var getTokenAction = function() {
		throw new Error('getTokenAction not implemented');
	};
	var storage = {
		get: function() {
			throw new Error('get not implemented');
		},
		set: function() {
			throw new Error('set not implemented');
		},
		remove: function() {
			throw new Error('remove not implemented');
		}
	};

	//////////////////////////////////////////////////////////////////////////////

	// called on creation of new CaliperService(...)
	initialize(options, getToken, storageService);

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
	function initialize(options, getToken, storageService) {

		// TODO: merge options with Options.default
		Options.validate(options);
		if (typeof getToken === 'undefined' || !getToken) {
			throw new Error('`getToken` is required');
		}
		if (typeof storageService === 'undefined' || !storageService) {
			throw new Error('`storageService` is required');
		}

		sendInterval = options.sendInterval;
		getTokenAction = getToken;
		storage = storageService;

		// Caliper Sensor
		sensorId = options.sensorId;
		sensorOptions = options.sensorOptions;
		Caliper.Sensor.initialize(sensorId, sensorOptions);

		// setup a storage queue
		var queue = storage.get(queueKey) || [];
		storage.set(queueKey, queue);

		// load saved authToken
		authToken = storage.get(authTokenKey) || null;

		// start a send interval
		setInterval(send, sendInterval);

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
		return getTokenAction(tokenEndpoint)
			.then(function(response) {
				var token = {
					accessToken: response.data['access_token'],
					expires: response.data['.expires']
				};
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
		var queue = storage.get(queueKey);
		queue.push(entry);
		storage.set(queueKey, queue);
	}

	function send() {
		if (busy || !initialized) {
			return;
		}

		var queue = storage.get(queueKey) || [];
		if (queue.length === 0) {
			return;
		}

		busy = true;
		logger('Sending Caliper Events...', queue);
		return getOrRefreshAuthToken()
			.then(function() {
				return Caliper.Sensor.send(queue)
					.then(function(response) {
						logger('Caliper Events Saved', response);
						storage.set(queueKey, []);
						busy = false;
					}).catch(function(error) {
						errorLogger('Caliper Error', error);
						setTimeout(function() {
							busy = false;
						}, sendInterval); // wait and try again
					});
			})
			.catch(function(error) {
				errorLogger('Caliper Token Error', error);
				setTimeout(function() {
					busy = false;
				}, sendInterval); // wait and try again
			});
	}

	//
	// Public Methods
	//

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

	// TODO: angular logic / init logic

	function init() {
		// Bind to window events
		// if ($window.addEventListener) {
		// 	$window.addEventListener('beforeunload', onBeforeUnloadHandler);
		// } else {
		// 	$window.onbeforeunload = onBeforeUnloadHandler;
		// }

		// Bind to log in
		// $rootScope.$on('authServiceDidLogIn', function () {
		// 	loadAuth();
		// });
		loadAuth();
	}

	function loadAuth() {
		if (!initialized || !hasAuthToken()) {
			return;
		}
		getOrRefreshAuthToken();
	}

	function onBeforeUnloadHandler() {
		if (!initialized || !hasAuthToken() || !person || !session) {
			return;
		}
		service.endSession();
	}
};
