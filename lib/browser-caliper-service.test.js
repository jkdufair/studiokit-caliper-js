const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-things'));
chai.use(chaiAsPromised);
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const expect = chai.expect;
chai.should();

const Raven = require('raven-js');
const HttpError = require('standard-http-error');
const utils = require('../test/utils');

const BrowserCaliperService = require('./browser-caliper-service');

function stubRavenIsSetup(isSetup) {
	return sinon.stub(Raven, 'isSetup').callsFake(function() {
		return isSetup;
	});
}

function restoreRavenIsSetup() {
	Raven.isSetup.restore();
}

function stubRavenCaptureException() {
	return sinon.stub(Raven, 'captureException').callsFake(function() {});
}

function restoreRavenCaptureException() {
	Raven.captureException.restore();
}

describe('BrowserCaliperService', function() {
	describe('ctor', function() {
		it('succeeds', function() {
			expect(() => new BrowserCaliperService(utils.getOptions())).to.not.throw(Error);
		});
	});

	describe('onError', function() {
		let store;
		let service;
		let captureExceptionStub;

		beforeEach(function() {
			store = {
				'studioKit:caliperService:queue': [{}, {}]
			};
			const options = utils.getOptions(store);
			service = new BrowserCaliperService(options);
			captureExceptionStub = stubRavenCaptureException();
		});

		afterEach(function() {
			restoreRavenCaptureException();
			restoreRavenIsSetup();
		});

		describe('without Raven', function() {
			beforeEach(function() {
				utils.stubCaliperSensorSendError(new Error());
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('does not call Raven.captureException', function() {
				stubRavenIsSetup(false);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.callCount(0);
				});
			});
		});

		describe('with HttpError 401', function() {
			beforeEach(function() {
				utils.stubCaliperSensorSend401();
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('does not call Raven.captureException', function() {
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.callCount(0);
				});
			});
		});

		describe('with non-401 HttpError', function() {
			const error = new HttpError(400);
			error.data = {
				userId: 1
			};
			beforeEach(function() {
				utils.stubCaliperSensorSendError(error);
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('calls Raven.captureException', function() {
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.callCount(1);
				});
			});

			it('calls Raven.captureException with error and error.data', function() {
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.been.calledWith(error, {
						extra: {
							data: error.data
						}
					});
				});
			});
		});

		describe('with generic Error', function() {
			const error = new Error();
			error.data = {
				userId: 1
			};
			beforeEach(function() {
				utils.stubCaliperSensorSendError(error);
			});

			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('calls Raven.captureException', function() {
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.callCount(1);
				});
			});

			it('calls Raven.captureException with error and error.data', function() {
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.been.calledWith(error, {
						extra: {
							data: error.data
						}
					});
				});
			});
		});

		describe('with generic Error where message is JSON and has status', function() {
			afterEach(function() {
				utils.restoreCaliperSensorSend();
			});

			it('does not call Raven.captureException if status = 401', function() {
				utils.stubCaliperSensorSendError(new Error('{"status":401}'));
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.callCount(0);
				});
			});

			it('calls Raven.captureException if status != 401', function() {
				utils.stubCaliperSensorSendError(new Error('{"status":400}'));
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.callCount(1);
				});
			});

			it('calls Raven.captureException with error and error.data if status != 401', function() {
				const error = new Error('{"status":400}');
				error.data = {
					userId: 1
				};
				utils.stubCaliperSensorSendError(error);
				stubRavenIsSetup(true);
				return service.send().catch(() => {
					return expect(captureExceptionStub).to.have.been.calledWith(error, {
						extra: {
							data: error.data
						}
					});
				});
			});
		});
	});
});
