const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-things'));
chai.use(chaiAsPromised);
const expect = chai.expect;
chai.should();
const _ = require('lodash');
const CaliperService = require('./caliper-service');

function getOptions() {
	var store = {};
	return {
		sensorId: 'https://app.example.edu/sensor',
		sensorOptions: {
			protocol: 'http:',
			hostname: 'localhost',
			port: '3001',
			path: '/collector',
			method: 'POST'
		},
		appId: 'https://app.example.edu',
		appName: 'Example App',
		getToken: function() {
			return new Promise(function(resolve, reject){
				resolve({
					accessToken: 'THIS_IS_NOT_A_REAL_ACCESS_TOKEN',
					expires: 'Thu, 09 Feb 2017 06:08:58 GMT'
				});
			});
		},
		storageService: {
			getItem: function(key) {
				return store[key];
			},
			setItem: function(key, value) {
				store[key] = value;
			},
			removeItem: function(key) {
				delete store[key]
			}
		}
	};
}

describe('CaliperService', function() {
	describe('ctor', function(){
		it('requires options parameter', function() {
			expect(() => new CaliperService()).to.throw(Error);
			expect(() => new CaliperService(null)).to.throw(Error);
		});
		it('succeeds with valid options', function() {
			expect(() => new CaliperService(getOptions())).to.not.throw(Error);
		});
	});
	describe('validateOptions', function() {
		it('requires sensorId, type string', function() {
			var options = getOptions();
			options.sensorId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires sensorOptions, plain object', function() {
			var options = getOptions();
			options.sensorOptions = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorOptions;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appId, type string', function() {
			var options = getOptions();
			options.appId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appName, type string', function() {
			var options = getOptions();
			options.appName = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appName;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
	});
	describe('tryGetOrRefreshAuthToken', function() {
		var service = new CaliperService(getOptions());
		it('returns a promise', function() {
			expect(service.tryGetOrRefreshAuthToken()).to.be.a('promise');
		});
	});
});
