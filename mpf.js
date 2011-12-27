/*
 */

var util = require('./util'),

	MPF_FRAME_START = exports.MPF_FRAME_START = 0x02, // start of transmission
	MPF_FRAME_END = exports.MPF_FRAME_END = 0x03, // end of transmission
	MPF_PACKET_TYPE_5 = exports.MPF_PACKET_TYPE_5 = 0x25 // packet type 5
	
/**
 * createType5Packet
 * Creates an mpf packet of type 5 for heartbeats.
 *
 * @param       int     sequence number
 * @param       string  banker code
 * @return      buffer  heartbeat message
 * @access      public
 */
exports.createType5Packet = function createType5Packet (seqno, code) {
  buf = new Buffer(10);
  buf[0] = MPF_FRAME_START;
  buf[1] = MPF_PACKET_TYPE_5;
  buf[2] = seqno;
  buf[3] = 0x20;
  buf.write(code, 4, 4, 'ascii');
  buf[8] = MPF_FRAME_END;
  
  // compute lrc
  buf[9] = util.computeLRC( buf, 1, 8 );
  
	return buf;
}
