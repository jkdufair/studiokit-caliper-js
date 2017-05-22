const moment = require('moment');
const uuid = require('uuid');
const sinon = require('sinon');
const Caliper = require('caliperjs');
const HttpError = require('standard-http-error');

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
		getToken: function() {
			return new Promise(function(resolve, reject) {
				resolve({
					accessToken: uuid.v4(),
					expires: moment().add(2, 'hours').toISOString()
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

function stubCaliperSensorSend() {
	sinon.stub(Caliper.Sensor, 'send').callsFake(function() {
		return new Promise(function(resolve, reject) {
			setTimeout(function() {
				resolve();
			}, 20);
		});
	});
}

function stubCaliperSensorSendError(error) {
	sinon.stub(Caliper.Sensor, 'send').callsFake(function() {
		return new Promise(function(resolve, reject) {
			setTimeout(function() {
				reject(error);
			}, 20);
		});
	});
}

function stubCaliperSensorSend401() {
	stubCaliperSensorSendError(new HttpError(401));
}

function stubCaliperSensorSend400() {
	stubCaliperSensorSendError(new HttpError(400));
}

function restoreCaliperSensorSend() {
	Caliper.Sensor.send.restore();
}

module.exports = {
	getOptions,
	stubCaliperSensorSend,
	stubCaliperSensorSendError,
	stubCaliperSensorSend401,
	stubCaliperSensorSend400,
	restoreCaliperSensorSend
};