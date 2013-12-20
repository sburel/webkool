
declare var exports;
declare var require;
	
module Less {
	'use strict';
	
	var less = require('less');

	exports.compile = function compile(buffer, stream) {
		var m = less.render(buffer, function (e, css) {
			if (e)
				throw new Error(e);
			stream.write(css);
		});
	};
}


