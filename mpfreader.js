var net = require('net'),
  mpf = require('./mpf');

var server = net.createServer(function (stream) {
  stream.addListener("data", function (data) {
    console.log("received => " + data.toString());
    
    // send ack
    buf = mpf.createACKPacket(1);
    console.log("sending ack packet => " + buf.toString());
    stream.write(buf);
  });
}).listen(2000, "127.0.0.1", function() {
    console.log("waiting for connections on port 2000...");
  });