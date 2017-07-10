const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-things'));
chai.use(chaiAsPromised);
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const expect = chai.expect;
chai.should();

const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const HttpError = require('standard-http-error');
const utils = require('../test/utils');

const BrowserStorageService = require('./browser-storage-service');
const CaliperService = require('./caliper-service');

const id = 'https://bobloblawslawfirm.edu/user/1';
const firstName = 'Bob';
const lastName = 'Loblaw';
const extensions = {
	'edu.bobloblawslawfirm.foo': 'bar'
};

function createService(store, options, onComplete) {
	options = options || {};
	options = _.merge(utils.getOptions(store), options);
	return new CaliperService(options, onComplete);
}

function createServiceAndSetPerson(store, options) {
	const caliperService = createService(store, options);
	caliperService.setPerson(id, firstName, lastName);
	return caliperService;
}

describe('CaliperService', function() {

	describe('ctor', function() {
		it('requires options parameter', function() {
			expect(() => new CaliperService()).to.throw(Error);
			expect(() => new CaliperService(null)).to.throw(Error);
		});
		it('succeeds with valid options', function() {
			expect(() => new CaliperService(utils.getOptions())).to.not.throw(Error);
		});
	});

	describe('validateOptions', function() {
		it('requires sensorId, type string', function() {
			var options = utils.getOptions();
			options.sensorId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires sensorOptions, plain object', function() {
			var options = utils.getOptions();
			options.sensorOptions = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorOptions;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appId, type string', function() {
			var options = utils.getOptions();
			options.appId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appName, type string', function() {
			var options = utils.getOptions();
			options.appName = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appName;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires getToken, type function', function() {
			var options = utils.getOptions();
			options.getToken = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.getToken;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService, type object', function() {
			var options = utils.getOptions();
			options.storageService = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.storageService;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.getItem, type function', function() {
			var options = utils.getOptions();
			options.storageService = {};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService = {
				getItem: 1
			};
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.setItem, type function', function() {
			var options = utils.getOptions();
			options.storageService = new BrowserStorageService();
			delete options.storageService.setItem;
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService.setItem = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.removeItem, type function', function() {
			var options = utils.getOptions();
			options.storageService = new BrowserStorageService();
			delete options.storageService.removeItem;
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService.removeItem = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('autoSend, type boolean', function() {
			var options = utils.getOptions();
			options.autoSend = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sendInterval, type number', function() {
			var options = utils.getOptions();
			options.sendInterval = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionIriPrefix, type string, not empty', function() {
			var options = utils.getOptions();
			options.sessionIriPrefix = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			options.sessionIriPrefix = '';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionTimeoutThreshold, type number', function() {
			var options = utils.getOptions();
			options.sessionTimeoutThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionKeepAliveThreshold, type number', function() {
			var options = utils.getOptions();
			options.sessionKeepAliveThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('activityUpdateThreshold, type number', function() {
			var options = utils.getOptions();
			options.activityUpdateThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('onError, type function', function() {
			var options = utils.getOptions();
			options.onError = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
	});

	describe('isInitialized', function() {
		it('returns true after init', function() {
			expect(createService().isInitialized()).to.be.true;
		});
	});

	describe('isInitialized async storage', function() {
		let store = {};
		let options = {};

		beforeEach(function() {
			store = {};
			options = {
				storageService: {
					getItem: function(key) {
						return new Promise((resolve, reject) => {
							setTimeout(resolve, 200, store[key]);
						});
					}
				}
			};
		});

		it('returns false before resolving storage loads', function() {
			expect(createService(store, options).isInitialized()).to.be.false;
		});

		it('returns true after resolving storage loads', function(done) {
			const service = createService(store, options, function() {
				expect(service.isInitialized()).to.be.true;
				done();
			});
		})
	});

	describe('isInitialized with storage error', function() {
		let store = {};
		let options = {};

		beforeEach(function() {
			store = {};
			options = {
				storageService: {
					getItem: function(key) {
						return new Promise((resolve, reject) => {
							setTimeout(reject, 200, new Error("couldn't read data"));
						});
					}
				}
			};
		});

		it('finishes initialization after read error', function() {
			const service = createService(store, options, function() {
				try {
					expect(service.isInitialized()).to.be.true;
					done();
				} catch (e) {
					done(e);
				}
			})
		});
	});

	describe('addActivityListeners', function() {
		it('adds event listeners if running in a browser', function() {
			global.window = {
				addEventListener: sinon.spy()
			};
			const service = createService();
			expect(global.window.addEventListener).to.have.been.called;
			delete global.window;
		});
	});

	describe('setPerson', function() {
		let caliperService;

		beforeEach(function() {
			caliperService = createService();
		});

		it('requires id, firstName, lastName', function() {
			expect(() => caliperService.setPerson()).to.throw(Error);
			expect(() => caliperService.setPerson(id)).to.throw(Error);
			expect(() => caliperService.setPerson(id, firstName)).to.throw(Error);
			expect(() => caliperService.setPerson(id, firstName, lastName)).to.not.throw(Error);
		});
		it('validates extensions, type object', function() {
			expect(() => caliperService.setPerson(id, firstName, lastName, 'string')).to.throw(Error);
			expect(() => caliperService.setPerson(id, firstName, lastName, extensions)).to.not.throw(Error);
		});
		it('fails if session is active', function() {
			caliperService.setPerson(id, firstName, lastName);
			caliperService.startSession();
			expect(() => caliperService.setPerson('https://bobloblawslawfirm.edu/user/2', firstName, lastName)).to.throw(Error);
		});
	});

	describe('startSession', function() {
		let caliperService;

		beforeEach(function() {
			caliperService = createServiceAndSetPerson();
		});

		it('succeeds', function() {
			expect(() => caliperService.startSession()).to.not.throw(Error);
		});
		it('succeeds if session is already active', function() {
			expect(() => caliperService.startSession()).to.not.throw(Error);
			expect(() => caliperService.startSession()).to.not.throw(Error);
		});
		it('validates extensions, type object', function() {
			expect(() => caliperService.startSession('string')).to.throw(Error);
			caliperService = createServiceAndSetPerson();
			expect(() => caliperService.startSession(extensions)).to.not.throw(Error);
		});
		it('requires setPerson to be called', function() {
			caliperService = createService();
			expect(() => caliperService.startSession()).to.throw(Error);
		});
	});

	describe('endSession', function() {
		let caliperService;

		beforeEach(function() {
			caliperService = createServiceAndSetPerson();
		});

		it('succeeds', function() {
			caliperService.startSession();
			expect(() => caliperService.endSession()).to.not.throw(Error);
		});
		it('requires setPerson to be called', function() {
			caliperService = createService();
			expect(() => caliperService.endSession()).to.throw(Error);
		});
		it('requires startSession to be called', function() {
			expect(() => caliperService.endSession()).to.throw(Error);
		});
	});

	describe('handleSavedSession', function() {
		let store = {};
		let caliperService;

		beforeEach(function() {
			store = {};
		});

		it('clears saved data if no saved person', function() {
			store['studioKit:caliperService:session'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(29, 'minutes').toISOString();
			caliperService = createService(store);
			expect(store['studioKit:caliperService:session']).to.equal(null);
			expect(store['studioKit:caliperService:person']).to.equal(null);
			expect(store['studioKit:caliperService:lastKeepAliveDate']).to.equal(null);
			expect(store['studioKit:caliperService:lastActivityDate']).to.equal(null);
		});
		it('clears saved data if no saved lastActivityDate', function() {
			store['studioKit:caliperService:session'] = {};
			store['studioKit:caliperService:person'] = {};
			caliperService = createService(store);
			expect(store['studioKit:caliperService:session']).to.equal(null);
			expect(store['studioKit:caliperService:person']).to.equal(null);
			expect(store['studioKit:caliperService:lastKeepAliveDate']).to.equal(null);
			expect(store['studioKit:caliperService:lastActivityDate']).to.equal(null);
		});
		it('resumes session if lastActivityDate is within sessionTimeoutThreshold (30 minutes)', function() {
			store['studioKit:caliperService:session'] = {
				'@id': 'https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2',
			};
			store['studioKit:caliperService:person'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(29, 'minutes').toISOString();
			caliperService = createService(store);
			expect(store['studioKit:caliperService:session']['@id']).to.equal('https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2');
		});
		it('starts new session if lastActivityDate is past sessionTimeoutThreshold (30 minutes), and close old session', function() {
			store['studioKit:caliperService:session'] = {
				'@id': 'https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2',
			};
			store['studioKit:caliperService:person'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(31, 'minutes').toISOString();
			caliperService = createService(store);
			expect(store['studioKit:caliperService:session']['@id']).to.not.equal('https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2');
		});
		it('starts new session if lastActivityDate is past sessionTimeoutThreshold (30 minutes) and no saved session', function() {
			store['studioKit:caliperService:person'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(31, 'minutes').toISOString();
			caliperService = createService(store);
			expect(store['studioKit:caliperService:session']).to.exist;
		});
	});

	describe('isMediaPlaying', function() {
		let service;
		let video;
		let audio;

		function getElementsByTagName(tagName) {
			return tagName === 'video' ? [video] : [audio];
		}

		beforeEach(function() {
			video = {
				currentTime: 1,
				paused: false,
				ended: false,
				readyState: 3
			};
			audio = {
				currentTime: 1,
				paused: false,
				ended: false,
				readyState: 3
			};
			global.document = {
				getElementsByTagName: getElementsByTagName
			};
			service = createService();
		});

		afterEach(function() {
			delete global.document;
		});

		it('returns true if a video element is playing', function() {
			expect(service.isMediaPlaying()).to.equal(true);
		});

		it('returns true if an audio element is playing', function() {
			video.currentTime = 0;
			expect(service.isMediaPlaying()).to.equal(true);
		});

		it('returns false if not running in browser', function() {
			delete global.document;
			expect(service.isMediaPlaying()).to.equal(false);
		});
	});

	describe('session time-out, keep-alive', function() {
		let clock;
		let store = {};
		let caliperService;
		const options = {
			autoSend: false,
			sessionTimeoutThreshold: 1000 * 5,
			sessionKeepAliveThreshold: 1000 * 2.5,
			activityUpdateThreshold: 1000
		};
		beforeEach(function() {
			store = {};
			clock = sinon.useFakeTimers();
			caliperService = createServiceAndSetPerson(store, options);
			caliperService.startSession();
		});

		afterEach(function() {
			clock.restore();
		});

		it('keepAliveSession requires startSession to be called', function() {
			caliperService.endSession();
			expect(() => caliperService.keepAliveSession()).to.throw(Error);;
		});

		it('onActivity is limited to activityUpdateThreshold', function() {
			var lastActivityDate = store['studioKit:caliperService:lastActivityDate'];
			caliperService.onActivity();
			clock.tick(options.activityUpdateThreshold / 2);
			caliperService.onActivity();
			expect(store['studioKit:caliperService:lastActivityDate']).to.equal(lastActivityDate);
			clock.tick(options.activityUpdateThreshold);
			caliperService.onActivity();
			expect(store['studioKit:caliperService:lastActivityDate']).to.not.equal(lastActivityDate);
		});
		it('time-out happens with no activity after sessionTimeoutThreshold', function() {
			// session started
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(options.sessionTimeoutThreshold - 1);
			// session almost timed out, still exists
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(1);
			// session timed out, is null
			expect(store['studioKit:caliperService:session']).to.equal(null);
		});
		it('activity delays time-out', function() {
			// session started
			// times out at options.sessionTimeoutThreshold
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			var id = store['studioKit:caliperService:session']['@id'];
			clock.tick(options.sessionTimeoutThreshold - 1);
			// session almost timed out, still exists
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			// trigger activity before time out
			// now times out at `(options.sessionTimeoutThreshold - 1) + options.sessionTimeoutThreshold`
			caliperService.onActivity();
			clock.tick(1);
			// original time out limit, session still exists
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(options.sessionTimeoutThreshold - 2);
			// session almost timed out, still exists
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			// same session as start
			expect(store['studioKit:caliperService:session']['@id']).to.equal(id);
		});
		it('activity after time-out starts a new session', function() {
			// session started
			var id = store['studioKit:caliperService:session']['@id'];
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(options.sessionTimeoutThreshold);
			// session timed out, null
			expect(store['studioKit:caliperService:session']).to.equal(null);
			caliperService.onActivity();
			// new session
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			// make sure it is a different session
			expect(store['studioKit:caliperService:session']['@id']).to.not.equal(id);
		});
		it('media playing delays time-out', function() {
			var stub = sinon.stub(caliperService, 'isMediaPlaying').callsFake(function() {
				return true;
			});

			// session started
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			var id = store['studioKit:caliperService:session']['@id'];
			clock.tick(options.sessionTimeoutThreshold - 1);
			// session almost timed out, still exists
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(1);
			// should have timed out, but isMediaPlaying causes it to still exist
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			// same session as start
			expect(store['studioKit:caliperService:session']['@id']).to.equal(id);

			caliperService.isMediaPlaying.restore();
		});
		it('keep-alive succeeds onActivity after sessionKeepAliveThreshold', function() {
			// session started
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			var id = store['studioKit:caliperService:session']['@id'];
			var dateModified = store['studioKit:caliperService:session']['dateModified'];

			// move before threshold
			clock.tick(options.sessionKeepAliveThreshold - options.activityUpdateThreshold);
			caliperService.onActivity();
			expect(store['studioKit:caliperService:session']['dateModified']).to.equal(dateModified);

			// move past threshold
			clock.tick(options.activityUpdateThreshold);
			caliperService.onActivity();

			// same session, new dateModified
			expect(store['studioKit:caliperService:session']['@id']).to.equal(id);
			expect(store['studioKit:caliperService:session']['dateModified']).to.not.equal(dateModified);
		});
	});

	describe('addToQueue', function() {
		it('throws error if item is nil', function() {
			const caliperService = createService();
			expect(() => caliperService.addToQueue()).to.throw(Error);
			expect(() => caliperService.addToQueue(null)).to.throw(Error);
		});
	});

	describe('getOrRefreshAuthToken', function() {
		let store = {};
		let options = {};

		beforeEach(function() {
			store = {};
			options = {};
		});

		it('loads saved non-expired auth token', function() {
			const token = {
				accessToken: uuid.v4(),
				expires: moment().add(2, 'hours').toISOString()
			};
			store['studioKit:caliperService:token'] = token;
			const caliperService = createService(store, options);
			const loadedToken = caliperService.getOrRefreshAuthToken();
			return expect(loadedToken).to.eventually.deep.equal(token);
		});
		it('refreshes a saved expired auth token', function() {
			const token = {
				accessToken: uuid.v4(),
				expires: moment().subtract(2, 'hours').toISOString()
			};
			store['studioKit:caliperService:token'] = token;
			const caliperService = createService(store, options);
			const loadedToken = caliperService.getOrRefreshAuthToken();
			return Promise.all([
				loadedToken.should.eventually.exist,
				loadedToken.should.eventually.not.deep.equal(token)
			]);
		});
		it('does not override token has not changed', function() {
			const token = {
				accessToken: uuid.v4(),
				expires: moment().add(2, 'hours').toISOString()
			};
			store['studioKit:caliperService:token'] = token;
			const caliperService = createService(store, options);
			let loadedToken = caliperService.getOrRefreshAuthToken();
			loadedToken = caliperService.getOrRefreshAuthToken();
			return Promise.all([
				loadedToken.should.eventually.exist,
				loadedToken.should.eventually.deep.equal(token)
			]);
		});
		it('throws an error if options.getToken() does not return a token', function() {
			options.getToken = function() {
				return new Promise(function(resolve, reject) {
					resolve();
				});
			}
			const caliperService = createService(store, options);
			const loadedToken = caliperService.getOrRefreshAuthToken();
			return expect(loadedToken).to
				.be.rejectedWith(Error, 'Error with `getToken` response: A response is required.');
		});
		it('throws an error if options.getToken() does not return a token with `accessToken` property', function() {
			options.getToken = function() {
				return new Promise(function(resolve, reject) {
					resolve({});
				});
			}
			const caliperService = createService(store, options);
			const loadedToken = caliperService.getOrRefreshAuthToken();
			return expect(loadedToken).to
				.be.rejectedWith(Error, 'Error with `getToken` response: `token.accessToken` is required.');
		});
		it('throws an error if options.getToken() does not return a token with `expires` property', function() {
			options.getToken = function() {
				return new Promise(function(resolve, reject) {
					resolve({
						accessToken: uuid.v4()
					});
				});
			}
			const caliperService = createService(store, options);
			const loadedToken = caliperService.getOrRefreshAuthToken();
			return expect(loadedToken).to
				.be.rejectedWith(Error, 'Error with `getToken` response: `token.expires` is required.');
		});

	});

	describe('send', function() {
		let store = {};
		let options = {};

		beforeEach(function() {
			store = {};
			options = {};
		});

		it('validates `maxItems`', function() {
			const caliperService = createService(store, options);
			const notNumberPromise = caliperService.send('string');
			const notValidNumberPromise = caliperService.send(-2);
			return Promise.all([
				notNumberPromise.should.be.rejectedWith(Error),
				notValidNumberPromise.should.be.rejectedWith(Error)
			]);
		});
		it('does nothing if queue is empty', function() {
			const caliperService = createService(store, options);
			const promise = caliperService.send();
			return expect(promise).to.be.resolved;
		});

		describe('with Errors', function() {
			let caliperService;
			const error = new Error('test error');
			beforeEach(function() {
				store = {};
				// add one object to the queue
				store['studioKit:caliperService:queue'] = [{}];
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('re-throws Error for bad token', function() {
				options = {
					getToken: function() {
						return new Promise(function(resolve, reject) {
							resolve();
						});
					}
				};
				caliperService = createService(store, options);
				utils.stubCaliperSensorSendError(error);
				return caliperService.send()
					.catch((err) => expect(err).to.exist);
			});

			it('re-throws Error for bad request', function() {
				caliperService = createService(store, options);
				utils.stubCaliperSensorSendError(error);
				return caliperService.send()
					.catch((err) => expect(err).to.exist);
			});
		});

		describe('with failed token', function() {
			let caliperService;

			beforeEach(function() {
				store = {};
				// add one object to the queue
				store['studioKit:caliperService:queue'] = [{}];
				// failing token
				options = {
					getToken: function() {
						return new Promise(function(resolve, reject) {
							resolve();
						});
					},
					onError: sinon.spy()
				};
				caliperService = createService(store, options);
				utils.stubCaliperSensorSend();
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('is rejected', function() {
				return caliperService.send().should.be.rejectedWith(Error);
			});

			it('calls options.onError once', function() {
				return caliperService.send()
					.catch(() => {
						return expect(options.onError).to.have.been.calledOnce;
					});
			});
		});

		describe('with valid token', function() {
			let caliperService;

			beforeEach(function() {
				store = {};
				store['studioKit:caliperService:queue'] = [{}, {}];
				caliperService = createService(store, options);
				utils.stubCaliperSensorSend();
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('resolves successfully, sends entire queue', function() {
				const promise = caliperService.send();
				return Promise.all([
					promise.should.be.resolved,
					promise.then(() => {
						return expect(store['studioKit:caliperService:queue'].length).to.equal(0);
					})
				]);
			});

			it('only sends the `maxItems` amount from the queue', function() {
				const promise = caliperService.send(1);
				return Promise.all([
					promise.should.be.resolved,
					promise.then(() => {
						return expect(store['studioKit:caliperService:queue'].length).to.equal(1);
					})
				]);
			});

			it('can send again after first request is complete', function() {
				const promise1 = caliperService.send();
				const promise2 = new Promise(function(resolve, reject) {
					setTimeout(function() {
						return caliperService.send()
							.then(resolve)
							.catch(reject);
					}, 100);
				});
				return Promise.all([
					promise1.should.be.resolved,
					promise2.should.be.resolved
				]);
			});

			it('rejected if request is already sending', function() {
				const promise1 = caliperService.send();
				const promise2 = caliperService.send();
				return Promise.all([
					promise1.should.be.resolved,
					promise2.should.be.rejectedWith(Error, 'Cannot send. Service is already sending a request.')
				]);
			});

		});

		describe('returns a 401', function() {
			let caliperService;

			beforeEach(function() {
				store = {};
				store['studioKit:caliperService:queue'] = [{}, {}];
				options = {
					onError: sinon.spy()
				};
				caliperService = createService(store, options);
				utils.stubCaliperSensorSend401();
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('is rejected with an HttpError 401', function() {
				return caliperService.send().should.be.rejectedWith(HttpError, 'Unauthorized');
			});

			it('clears authToken', function() {
				return caliperService.send()
					.catch(() => {
						return expect(store).to.not.include.keys('studioKit:caliperService:authToken');
					});
			});

			it('calls options.onError once', function() {
				return caliperService.send()
					.catch(() => {
						return expect(options.onError).to.have.been.calledOnce;
					});
			});
		});

		describe('returns a 400', function() {
			let caliperService;

			beforeEach(function() {
				store = {};
				store['studioKit:caliperService:queue'] = [{}, {}];
				options = {
					onError: sinon.spy()
				};
				caliperService = createService(store, options);
				utils.stubCaliperSensorSend400();
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('is rejected with an HttpError 400', function() {
				return expect(caliperService.send()).to.be.rejectedWith(HttpError, 'Bad Request');
			});

			it('clears bad items from the queue', function() {
				return caliperService.send(1)
					.catch(() => {
						return expect(store['studioKit:caliperService:queue'].length).to.equal(1);
					});
			});

			it('calls options.onError once', function() {
				return caliperService.send()
					.catch(() => {
						return expect(options.onError).to.have.been.calledOnce;
					});
			});
		});

		describe('returns a 500', function() {
			let caliperService;

			beforeEach(function() {
				store = {
					'studioKit:caliperService:queue': [{}, {}]
				};
				options = {
					onError: sinon.spy()
				};
				caliperService = createService(store, options);
				utils.stubCaliperSensorSendError(new HttpError(500));
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('is rejected with an HttpError 500', function() {
				return expect(caliperService.send()).to.be.rejectedWith(HttpError, 'Internal Server Error');
			});

			it('calls options.onError once', function() {
				return caliperService.send()
					.catch(() => {
						return expect(options.onError).to.have.been.calledOnce;
					});
			});
		});
	});

	describe('autoSend', function() {
		let store = {};
		let options = {};
		let caliperService;

		describe('when `options.autoSend` = false', function() {

			beforeEach(function() {
				store = {};
				options = {
					autoSend: false,
					sendInterval: 1000
				};
				clock = sinon.useFakeTimers();
				caliperService = createServiceAndSetPerson(store, options);
			});

			afterEach(function() {
				clock.restore();
			});

			it('does not call `send` if option is false', function() {
				const spy = sinon.spy(caliperService, 'send');
				clock.tick(options.sendInterval);
				expect(spy).to.have.callCount(0);
				caliperService.send.restore();
			});
		});

		describe('when `options.autoSend` = true', function() {

			beforeEach(function() {
				store = {};
				options = {
					autoSend: true,
					sendInterval: 1000
				};
				clock = sinon.useFakeTimers();
				caliperService = createServiceAndSetPerson(store, options);
			});

			afterEach(function() {
				clock.restore();
			});

			it('calls `send` once after `sendInterval`', function() {
				const spy = sinon.spy(caliperService, 'send');
				clock.tick(options.sendInterval);
				expect(spy).to.have.callCount(1);
				caliperService.send.restore();
			});

			it('calls `send` again after a failed attempt', function() {
				const stub = sinon.stub(caliperService, 'send').callsFake(function() {
					return new Promise(function(resolve, reject) {
						reject();
					});
				});
				clock.tick(options.sendInterval * 2);
				expect(stub).to.have.callCount(2);
				caliperService.send.restore();
			});
		});
	});
});
