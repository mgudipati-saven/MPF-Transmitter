var	path = require('path'),
	fs = require('fs');

/**
 * Function to convert a number into 32-bit buffer
 *
 * @param       number  number to convert
 * @return      buffer  32 bits
 * @access      public
 */
exports.to32Bits = function to32Bits(num) {
	var bytes = new Buffer(4),
  		i = 4;

  	do {
    	bytes[--i] = num & (255);
     	num = num>>8;
  	} while ( i )
	//console.log(bytes);
  	return bytes;
}

/**
 * Function to convert a 32-bit buffer into a number
 *
 * @param      buffer  32 bits
 * @return     number  number representing the 32 bits
 * @access     public
 */
exports.toNum = function toNum(buf) {
  	var	i = 4;
		num = 0;
		numBits = 0;
		
  	do {
		num += (buf[--i]<<numBits);
		numBits += 8;
  	} while ( i )
	//console.log(num);
  	return num;
}

/**
 */
exports.loadStaticFile = function loadStaticFile(uri, res) {
	var filename = path.join(process.cwd(), uri);
	path.exists(filename, function(exists) {
		if(!exists) {
			res.writeHead(404, {"Content-Type": "text/plain"});
			res.write("404 Not Found\n");
			res.end();
			return;
		}

		fs.readFile(filename, "binary", function(err, file) {
			if(err) {
				res.writeHead(500, {"Content-Type": "text/plain"});
				res.write(err + "\n");
				res.end();
				return;
			}

			res.writeHead(200);
			res.write(file, "binary");
			res.end();
		});
	});
}

/**
 */
exports.computeLRC = function computeLRC(buf, start, end) {
  lrc = 0;
  for (var i = start; i <= end; i++) {
    lrc = lrc ^ buf[i];
  }
  return lrc;
}