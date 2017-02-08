module.exports = {
	isAvailable: function () {
		try {
			localStorage.setItem('storage', '');
			localStorage.removeItem('storage');
			return true;
		} catch (error) {
			return false;
		}
	}
};
