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

const BrowserStorageService = require('./browser-storage-service');

describe('BrowserStorageService', function() {
	let service;

	describe('ctor', function() {
		it('succeeds', function() {
			expect(() => service = new BrowserStorageService()).to.not.throw(Error);
		});
	});
	describe('setItem', function() {
		it('succeeds', function() {
			expect(() => service.setItem('foo', 'bar')).to.not.throw(Error);
		});
		it('succeeds with Plain Object', function() {
			expect(() => service.setItem('obj', {
				blah: 'blah'
			})).to.not.throw(Error);
		});
	});
	describe('getItem', function() {
		it('succeeds to get simple value', function() {
			let value;
			expect(() => value = service.getItem('foo')).to.not.throw(Error);
			expect(value).to.equal('bar');
		});
		it('succeeds to get object', function() {
			let value;
			expect(() => value = service.getItem('obj')).to.not.throw(Error);
			expect(value).to.deep.equal({
				blah: 'blah'
			});
		});
	});
	describe('removeItem', function() {
		it('succeeds to remove simple value', function() {
			expect(() => service.removeItem('foo')).to.not.throw(Error);
			const value = service.getItem('foo');
			expect(value).to.be.undefined;
		});
		it('succeeds to remove object', function() {
			expect(() => service.removeItem('obj')).to.not.throw(Error);
			const value = service.getItem('obj');
			expect(value).to.be.undefined;
		});
	});
});
