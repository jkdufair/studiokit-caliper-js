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
const CaliperService = require('./caliper-service');
const moment = require('moment');

function getOptions(store) {
	store = store || {};
	return {
		sensorId: 'https://app.example.edu/sensor',
		sensorOptions: {
			protocol: 'https:',
			hostname: 'localhost',
			port: '3001',
			path: '/collector',
			method: 'POST'
		},
		appId: 'https://app.example.edu',
		appName: 'Example App',
		getToken: function () {
			return new Promise(function (resolve, reject) {
				resolve({
					accessToken: 'THIS_IS_NOT_A_REAL_ACCESS_TOKEN',
					expires: 'Thu, 09 Feb 2017 06:08:58 GMT'
				});
			});
		},
		storageService: {
			getItem: function (key) {
				return store[key];
			},
			setItem: function (key, value) {
				store[key] = value;
			},
			removeItem: function (key) {
				delete store[key]
			}
		}
	};
}

describe('CaliperService', function () {
	describe('ctor', function () {
		it('requires options parameter', function () {
			expect(() => new CaliperService()).to.throw(Error);
			expect(() => new CaliperService(null)).to.throw(Error);
		});
		it('succeeds with valid options', function () {
			expect(() => new CaliperService(getOptions())).to.not.throw(Error);
		});
	});
	describe('validateOptions', function () {
		it('requires sensorId, type string', function () {
			var options = getOptions();
			options.sensorId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires sensorOptions, plain object', function () {
			var options = getOptions();
			options.sensorOptions = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorOptions;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appId, type string', function () {
			var options = getOptions();
			options.appId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appName, type string', function () {
			var options = getOptions();
			options.appName = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appName;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires getToken, type function', function () {
			var options = getOptions();
			options.getToken = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.getToken;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService, type object', function () {
			var options = getOptions();
			options.storageService = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.storageService;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.getItem, type function', function () {
			var options = getOptions();
			options.storageService = {};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService = {
				getItem: 1
			};
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.setItem, type function', function () {
			var options = getOptions();
			options.storageService = {
				getItem: function () {}
			};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService.setItem = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.removeItem, type function', function () {
			var options = getOptions();
			options.storageService = {
				getItem: function () {},
				setItem: function () {}
			};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService.removeItem = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('autoSend, type boolean', function () {
			var options = getOptions();
			options.autoSend = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sendInterval, type number', function () {
			var options = getOptions();
			options.sendInterval = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionIriPrefix, type string, not empty', function () {
			var options = getOptions();
			options.sessionIriPrefix = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			options.sessionIriPrefix = '';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionTimeoutThreshold, type number', function () {
			var options = getOptions();
			options.sessionTimeoutThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionKeepAliveThreshold, type number', function () {
			var options = getOptions();
			options.sessionKeepAliveThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('activityUpdateThreshold, type number', function () {
			var options = getOptions();
			options.activityUpdateThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('onError, type function', function () {
			var options = getOptions();
			options.onError = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
	});

	let caliperService;
	const id = 'https://bobloblawslawfirm.edu/user/1';
	const firstName = 'Bob';
	const lastName = 'Loblaw';
	const extensions = {
		'edu.bobloblawslawfirm.foo': 'bar'
	};

	function resetService(store, options) {
		options = options || {};
		options = _.merge(getOptions(store), options);
		caliperService = new CaliperService(options);
	}

	function setPerson() {
		caliperService.setPerson(id, firstName, lastName);
	}

	describe('isInitialized', function () {
		resetService();
		it('returns true after init', function () {
			expect(caliperService.isInitialized()).to.be.true;
		});
	});
	describe('setPerson', function () {
		resetService();
		it('requires id, firstName, lastName', function () {
			expect(() => caliperService.setPerson()).to.throw(Error);
			expect(() => caliperService.setPerson(id)).to.throw(Error);
			expect(() => caliperService.setPerson(id, firstName)).to.throw(Error);
			expect(() => setPerson()).to.not.throw(Error);
		});
		it('validates extensions, type object', function () {
			expect(() => caliperService.setPerson(id, firstName, lastName, 'string')).to.throw(Error);
			expect(() => caliperService.setPerson(id, firstName, lastName, extensions)).to.not.throw(Error);
		});
	});
	describe('startSession', function () {
		it('succeeds', function () {
			resetService();
			setPerson();
			expect(() => caliperService.startSession()).to.not.throw(Error);
		});
		it('succeeds if session is already active', function () {
			expect(() => caliperService.startSession()).to.not.throw(Error);
		});
		it('validates extensions, type object', function () {
			resetService();
			setPerson();
			expect(() => caliperService.startSession('string')).to.throw(Error);
			resetService();
			setPerson();
			expect(() => caliperService.startSession(extensions)).to.not.throw(Error);
		});
		it('requires setPerson to be called', function () {
			resetService();
			expect(() => caliperService.startSession()).to.throw(Error);
		});
	});
	it('setPerson fails if session is active', function () {
		resetService();
		setPerson();
		caliperService.startSession();
		expect(() => caliperService.setPerson('https://bobloblawslawfirm.edu/user/2', firstName, lastName)).to.throw(Error);
	});
	describe('endSession', function () {
		it('succeeds', function () {
			resetService();
			setPerson();
			caliperService.startSession();
			expect(() => caliperService.endSession()).to.not.throw(Error);
		});
		it('requires setPerson to be called', function () {
			resetService();
			expect(() => caliperService.endSession()).to.throw(Error);
		});
		it('requires startSession to be called', function () {
			resetService();
			setPerson();
			expect(() => caliperService.endSession()).to.throw(Error);
		});
	});

	describe('handleSavedSession', function () {
		const store = {};
		it('clears saved data if no saved person', function () {
			const store = {};
			store['studioKit:caliperService:session'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(29, 'minutes').toISOString();
			resetService(store);
			expect(store['studioKit:caliperService:session']).to.equal(null);
			expect(store['studioKit:caliperService:person']).to.equal(null);
			expect(store['studioKit:caliperService:lastKeepAliveDate']).to.equal(null);
			expect(store['studioKit:caliperService:lastActivityDate']).to.equal(null);
		});
		it('clears saved data if no saved lastActivityDate', function () {
			const store = {};
			store['studioKit:caliperService:session'] = {};
			store['studioKit:caliperService:person'] = {};
			resetService(store);
			expect(store['studioKit:caliperService:session']).to.equal(null);
			expect(store['studioKit:caliperService:person']).to.equal(null);
			expect(store['studioKit:caliperService:lastKeepAliveDate']).to.equal(null);
			expect(store['studioKit:caliperService:lastActivityDate']).to.equal(null);
		});
		it('resumes session if lastActivityDate is within sessionTimeoutThreshold (30 minutes)', function () {
			const store = {};
			store['studioKit:caliperService:session'] = {
				'@id': 'https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2',
			};
			store['studioKit:caliperService:person'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(29, 'minutes').toISOString();
			resetService(store);
			expect(store['studioKit:caliperService:session']['@id']).to.equal('https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2');
		});
		it('starts new session if lastActivityDate is past sessionTimeoutThreshold (30 minutes)', function () {
			const store = {};
			store['studioKit:caliperService:session'] = {
				'@id': 'https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2',
			};
			store['studioKit:caliperService:person'] = {};
			store['studioKit:caliperService:lastActivityDate'] = moment().subtract(31, 'minutes').toISOString();
			resetService(store);
			expect(store['studioKit:caliperService:session']['@id']).to.not.equal('https://app.example.edu/session/89d9951f-c026-4702-8abd-f4a1705467b2');
		});
	});

	describe('session time-out, keep-alive', function () {
		let clock;
		let store = {};
		const options = {
			autoSend: false,
			sessionTimeoutThreshold: 1000 * 5,
			sessionKeepAliveThreshold: 1000 * 2.5,
			activityUpdateThreshold: 1000
		};
		beforeEach(function () {
			store = {};
			clock = sinon.useFakeTimers();
			resetService(store, options);
			setPerson();
			caliperService.startSession();
		});

		afterEach(function () {
			clock.restore();
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

		it('time-out happens with no activity after sessionTimeoutThreshold', function () {
			// session started
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(options.sessionTimeoutThreshold - 1);
			// session almost timed out, still exists
			expect(store['studioKit:caliperService:session']).to.not.equal(null);
			clock.tick(1);
			// session timed out, is null
			expect(store['studioKit:caliperService:session']).to.equal(null);
		});

		it('activity delays time-out', function () {
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

		it('activity after time-out starts a new session', function () {
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

		it('media playing delays time-out', function () {
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

		it('keep-alive succeeds onActivity after sessionKeepAliveThreshold', function () {
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
});
