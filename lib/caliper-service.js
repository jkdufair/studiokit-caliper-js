var moment = require('moment');
var uuid = require('uuid');
var StandardHttpError = require('standard-http-error');
var debug = require('debug');
var logger = debug('CaliperService');
var errorLogger = debug('app:error');
var Caliper = require('caliperjs');
var _ = require('lodash');

function CaliperService(id, options, getToken, storageService) {

	var service = this;

	// Local variables
	var isInitialized = false;
	var authToken = null;
	var authTokenKey = 'studioKit:caliperService:token';
	var queue = [];
	var queueKey = 'studioKit:caliperService:queue';
	var sendPromise = null;
	var sessionKeepAliveMillis = 1000 * 60 * 15; // 15 minutes
	var sessionKeepAliveInterval;

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
	var store = {};
	var storage = {
		getItem: function(key) {
			return store[key];
		},
		setItem: function(key, value) {
			store[key] = value;
		},
		removeItem: function(key) {
			delete store[key]
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
	 * @param storageService - (optional) Persistance layer for storing credentials and queue between app launches, e.g. localStorage
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

		// setup Caliper Sensor
		sensorId = id;
		sensorOptions = options;
		Caliper.Sensor.initialize(sensorId, sensorOptions);

		// setup a storage queue
		queue = storage.getItem(queueKey) || [];
		storage.setItem(queueKey, queue);

		// load saved authToken
		authToken = storage.getItem(authTokenKey) || null;

		isInitialized = true;
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
				if (typeof token === 'undefined' || !token) {
					throw new Error('`token` is required');
				}
				if (typeof token.accessToken === 'undefined' || !token.accessToken) {
					throw new Error('`token.accessToken` is required');
				}
				if (typeof token.expires === 'undefined' || !token.expires) {
					throw new Error('`token.expires` is required');
				}
				logger('GET Caliper EventStore Token Success', token);
				storage.setItem(authTokenKey, token);
				authToken = token;
				updateSensorToken(authToken);
			})
			.catch(function(error) {
				errorLogger('GET Caliper EventStore Token Error', error);
				storage.removeItem(authTokenKey);
				authToken = null;
				throw error;
			});
	}

	function updateSensorToken(token) {
		var headers = sensorOptions.headers || {};

		// create new authorization header
		var authorization = 'Bearer ' + token.accessToken;

		// stop if authorization has not changed
		if (headers.Authorization && headers.Authorization === authorization) {
			return;
		}

		// update authorization
		headers.Authorization = authorization;
		sensorOptions.headers = headers;

		// update Caliper Sensor, just resets the HTTP request options
		Caliper.Sensor.initialize(sensorId, sensorOptions);
	}

	function addToQueue(item) {
		if (typeof item === 'undefined' || !item) {
			throw new Error('`item` is required');
		}
		queue.push(item);
		storage.setItem(queueKey, queue);
	}

	function checkServiceInitialized() {
		if (!isInitialized) {
			throw new Error('Cannot start Session. Service is not initialized.');
		}
	}

	function checkFullyInitialized() {
		checkServiceInitialized();

		if (!softwareApplication || typeof softwareApplication === 'undefined') {
			throw new Error('Cannot start Session: `softwareApplication` is not defined. You must call `setSoftwareApplication()` first.');
		}
		if (!person || typeof person === 'undefined') {
			throw new Error('Cannot start Session: `person` is not defined. You must call `setPerson()` first.');
		}
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
						storage.setItem(queueKey, queue);
						sendPromise = null;
					}).catch(function(error) {
						// clear auth token for Unauthorized response
						if (error instanceof StandardHttpError && error.code === 401) {
							storage.removeItem(authTokenKey);
							authToken = null;
						}
						errorLogger('Caliper Error', error);
						sendPromise = null;
						throw error;
					});
			});

		return sendPromise;
	}

	function setSoftwareApplication(id, name) {
		if (typeof id === 'undefined' || !id || typeof name === 'undefined' || !name) {
			throw new Error('`id` and `name` required');
		}
		softwareApplication = new Caliper.Entities.SoftwareApplication(id);
		softwareApplication.name = name;
		logger('setSoftwareApplication', softwareApplication);
	}

	function setPerson(id, firstName, lastName) {
		if (!id || typeof id === 'undefined' || !firstName || typeof firstName === 'undefined' || !lastName || typeof lastName === 'undefined') {
			throw new Error('`id`, `firstName`, `lastName` are required');
		}
		person = new Caliper.Entities.Person(id);
		person.name = firstName + ' ' + lastName;
		logger('setPerson', person);
	}

	function startSession(idPrefix, extensions) {
		checkFullyInitialized();

		if (session) {
			throw new Error('Cannot start Session: `session` already defined. You must call `endSession()` to end the current session before starting a new one.');
		}

		// create Session
		var nowISOString = moment().toISOString();
		var sessionId = uuid.v4();
		session = new Caliper.Entities.Session((idPrefix || softwareApplication['@id']) + '/session/' + sessionId);
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
		addToQueue(event);

		sessionKeepAliveInterval = setInterval(keepAliveSession, sessionKeepAliveMillis);
	}

	function keepAliveSession() {
		checkServiceInitialized();

		if (!session || typeof session === 'undefined') {
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
	}

	function endSession() {
		checkFullyInitialized();

		if (!session || typeof session === 'undefined') {
			throw new Error('Cannot end Session: `session` is not defined. You must call `startSession()` first.');
		}

		// end Session
		var nowISOString = moment().toISOString();
		session.endedAtTime = nowISOString;
		session.dateModified = nowISOString;

		// create Event
		var event = new Caliper.Events.SessionEvent();
		event.setActor(person);
		event.setAction(Caliper.Actions.SessionActions.LOGGED_OUT);
		event.setObject(session);
		event.setEventTime(nowISOString);
		event.setEdApp(softwareApplication);

		// add Event to queue
		logger('endSession', event);
		addToQueue(event);

		// clear session and keepAlive
		session = null;
		if (sessionKeepAliveInterval) {
			clearTimeout(sessionKeepAliveInterval);
		}
		sessionKeepAliveInterval = null;
	}

	function createAttempt(id, assignable) {
		id = id || uuid.v4();
		var attempt = new Caliper.Entities.Attempt(id);
		attempt.actor = person;
		attempt.assignable = assignable;
		return attempt;
	}

	function createAssessmentItem(id, isoString, options) {
		var assessmentItem = new Caliper.Entities.AssessmentItem(id);
		// TODO set other props
		return assessmentItem;
	}

	function createAssessment(id, isoString, options) {
		var assessment = new Caliper.Entities.Assessment(id);

		if (options && typeof options !== 'undefined') {
			if (options.dateToActivate && typeof options.dateToActivate !== 'undefined') {
				assessment.dateToActivate = options.dateToActivate;
			}
			if (options.dateToShow && typeof options.dateToShow !== 'undefined') {
				assessment.dateToShow = options.dateToShow;
			}
			if (options.dateToStartOn && typeof options.dateToStartOn !== 'undefined') {
				assessment.dateToStartOn = options.dateToStartOn;
			}
			if (options.dateToSubmit && typeof options.dateToSubmit !== 'undefined') {
				assessment.dateToSubmit = options.dateToSubmit;
			}
			if (options.maxAttempts && typeof options.maxAttempts !== 'undefined') {
				assessment.maxAttempts = options.maxAttempts;
			}
			if (options.maxSubmits && typeof options.maxSubmits !== 'undefined') {
				assessment.maxSubmits = options.maxSubmits;
			}
			if (options.maxScore && typeof options.maxScore !== 'undefined') {
				assessment.maxScore = options.maxScore;
			}
		}

		return assessment;
	}

	function enqueueAssessmentEvent(isoString, action, object, generated, target, label) {
		// create Event
		var event = new Caliper.Events.AssessmentEvent();
		event.setEventTime(isoString);
		event.setActor(person);
		event.setAction(action);
		event.setObject(object);
		event.setGenerated(generated);
		event.setTarget(target);
		event.setEdApp(softwareApplication);

		// add Event to queue
		logger(label, event);
		addToQueue(event);
	}

	function startAssessment(id, attemptId, options) {
		checkFullyInitialized();

		if (!id || typeof id === 'undefined') {
			throw new Error('Cannot start Assessment in Caliper: id is not defined. You must pass an id .');
		}

		var nowISOString = moment().toISOString();
		var assessment = createAssessment(id, nowISOString, options);
		var attempt = createAttempt(attemptId, assessment);
		attempt.startedAtTime = nowISOString;
		attempt.dateCreated = nowISOString;
		attempt.dateModified = nowISOString;

		enqueueAssessmentEvent(nowISOString, Caliper.Actions.AssessmentActions.STARTED, assessment, attempt, null, "startAssessment");
	}

	function restartAssessment(id, attemptId) {
		checkFullyInitialized();

		var nowISOString = moment().toISOString();
		var assessment = createAssessment(id);
		var attempt = createAttempt(attemptId, assessment);
		attempt.dateModified = nowISOString;

		enqueueAssessmentEvent(nowISOString, Caliper.Actions.AssessmentActions.RESTARTED, attempt, null, assessment, "restartAssessment");
	}

	function pauseAssessment(id, attemptId) {
		checkFullyInitialized();

		var nowISOString = moment().toISOString();
		var assessment = createAssessment(id);
		var attempt = createAttempt(attemptId, assessment);
		attempt.dateModified = nowISOString;

		enqueueAssessmentEvent(nowISOString, Caliper.Actions.AssessmentActions.PAUSED, attempt, null, assessment, "pauseAssessment");
	}

	function endAssessment(id, attemptId) {
		checkFullyInitialized();

		var nowISOString = moment().toISOString();
		var assessment = createAssessment(id);
		var attempt = createAttempt(attemptId, assessment);
		attempt.dateModified = nowISOString;
		attempt.endedAtTime = nowISOString;

		enqueueAssessmentEvent(nowISOString, Caliper.Actions.AssessmentActions.SUBMITTED, attempt, null, assessment, "endAssessment");
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
	service.startAssessment = startAssessment;
	service.restartAssessment = restartAssessment;
	service.pauseAssessment = pauseAssessment;
	service.endAssessment = endAssessment;

}

module.exports = CaliperService;
