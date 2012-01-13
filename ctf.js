/*
 */

var util = require('util'), 
    events = require('events'),
    net = require('net'),

  	CTF_FRAME_START = exports.FRAME_START 			        = 0x04, // ctf start of frame byte
  	CTF_FRAME_END = exports.FRAME_END 			            = 0x03, // ctf end of frame byte
  	CTF_PROTOCOL_SIGNATURE = exports.PROTOCOL_SIGNATURE	= 0x20; // ctf protocol signature byte
  	CTF_PAYLOAD_SIZE = exports.PAYLOADSIZE              = 0x21; // ctf payload size (dummy - used as a state for parsing)
  	CTF_PAYLOAD = exports.PAYLOAD                       = 0x22; // ctf payload (dummy - used as a state for parsing)

/**
 * CTF Client constructor
 * 
 * @param {Socket} stream
 * 		The feed's socket stream
 */
function Client(stream) {
	this._sock = stream;

  this._ctfState = CTF_FRAME_START;   // current ctf state
  this._payloadBuffer = null;     // buffer to hold ctf payload
  this._payloadBytesLeft = 0;     // ctf payload bytes left to be processed
  this._payloadSizeBuffer = null; // buffer to hold ctf payload size
  this._payloadSizeBytesLeft = 0; // ctf payload size bytes left to be processed

	events.EventEmitter.call(this);
}
util.inherits(Client, events.EventEmitter);

/**
 * createClient
 *    Creates a new instance of the client object attached to the stream
 *
 * @param {Socket} stream
 * 		The feed's socket stream
 *
 * @return {Client} 
 *    A new instance of the MPF Client object
 *
 * @access public
 */
exports.createClient = function (stream) {
  var c = new Client(stream);

  // deserialization setup
  stream.on('data', function (chunk) {
    c.deserialize(chunk);
  });

  return c;
}

/**
 * deserialize
 *    deserializes ctf packets from partial byte stream.
 *
 * @param {Buffer} chunk
 *    ctf bytes read from the stream
 * 
 * @access public
 */
Client.prototype.deserialize = function (chunk) {  
  for (var i = 0; i < chunk.length; i++) {
    switch (this._ctfState) {
      case CTF_FRAME_START: // start of a new ctf frame
        if (chunk[i] == CTF_FRAME_START) {
          this._ctfState = CTF_PROTOCOL_SIGNATURE;
        } else {
          _logger.error("Error: expecting ctf start byte, received " + chunk[i]);
          // TODO
        }
      break;

      case CTF_PROTOCOL_SIGNATURE: // ctf protocol signature
        if (chunk[i] == CTF_PROTOCOL_SIGNATURE) {
          this._ctfState = 0x021;
          this._payloadSizeBuffer = new Buffer(4);
          this._payloadSizeBytesLeft = 4;
        } else {
          console.log("Error: expecting ctf protocol signature byte, received " + chunk[i]);
          // TODO
        }
      break;

      case CTF_PAYLOAD_SIZE: // payload size
        // continute to collect payload size bytes
        this._payloadSizeBuffer[this._payloadSizeBuffer.length - this._payloadSizeBytesLeft--] = chunk[i];

        if (this._payloadSizeBytesLeft == 0) {
          // done collecting payload size bytes
          var payloadSize = toNum(this._payloadSizeBuffer);
          this._payloadBuffer = new Buffer(payloadSize);
          this._payloadBytesLeft = payloadSize;
          this._ctfState = CTF_PAYLOAD;
        }
      break;

      case CTF_PAYLOAD: // payload
        this._payloadBuffer[this._payloadBuffer.length - this._payloadBytesLeft--] = chunk[i];
        if (this._payloadBytesLeft == 0) {
          this._ctfState = CTF_FRAME_END;
        }
      break;

      case CTF_FRAME_END: // end of ctf frame
        if (chunk[i] == CTF_FRAME_END) {
          this.emit('message', toJSON(this._payloadBuffer.toString()));
          this._ctfState = CTF_FRAME_START;
        } else {
          console.log("Error: expecting ctf frame end byte, received " + chunk[i]);
          // TODO
        }
      break;
    }
  }
}

/**
 * Sends a command to ctf feed
 */
Client.prototype.sendCommand = function (cmd) {
  this._sock.write(serialize(cmd));
}

/**
 * serialize(string)
 *    Creates a ctf message out of a name/value paired string.
 *    For e.g. "5022=LoginUser|5028=plusserver|5029=plusserver|5026=1"
 *
 * @param       string  ctf message
 * @return      buffer  serialized ctf message
 * @access      public
 */
function serialize (str) {

	var msglen = Buffer.byteLength(str, 'ascii'),
		  ctfmsg = new Buffer(msglen + 7); //1 STX, 1 PROTO SIG, 4 LEN, 1 ETX

	// start of the frame - 1 byte
	ctfmsg[0] = CTF_FRAME_START;

	// protocol version - 1 byte
	ctfmsg[1] = CTF_PROTOCOL_SIGNATURE;

	// lenght of the payload - 4 bytes
	to32Bits(msglen).copy(ctfmsg, 2, 0, 4);

	// payload
	ctfmsg.write(str, 6, 'ascii');

	ctfmsg[ctfmsg.length-1] = CTF_FRAME_END;

	return ctfmsg;
}

/**
 * toJSON
 *    Converts a ctf message into JSON object
 * 
 * @param {String} ctfmsg
 *    A ctf message
 *
 * @return {JSON} 
 *    A JSON Object containing parsed ctf message
 */
function toJSON (ctfmsg) {
	var tokenPairs = ctfmsg.split("|");
		  myJSONObject = {};
	
	for (var i = 0; i < tokenPairs.length; i++) {
		var tokenPair = tokenPairs[i].split("=");
		myJSONObject['' + tokenPair[0]] = tokenPair[1];
	}
	
	return myJSONObject;
}

/**
 * to32Bits
 *    Function to convert a number into 32-bit buffer
 *
 * @param {Number} num
 *    number to convert
 *
 * @return {Buffer}
 *    32 bits
 */
function to32Bits(num) {
	var bytes = new Buffer(4),
  		i = 4;

  do {
  	bytes[--i] = num & (255);
   	num = num>>8;
	} while ( i )
	
	return bytes;
}

/**
 * toNum
 *    Function to convert a 32-bit buffer into a number
 *
 * @param {Buffer} buf 
 *    32 bits
 *
 * @return (Number)
 *    number representing the 32 bits
 */
function toNum(buf) {
	var	i = 4,
	    num = 0,
	    numBits = 0;
	
	do {
  	num += (buf[--i]<<numBits);
  	numBits += 8;
	} while ( i )
	
	return num;
}