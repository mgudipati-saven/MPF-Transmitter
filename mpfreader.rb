require 'socket'                # Get sockets from stdlib

server = TCPServer.open(2000)   # Socket to listen on port 2000
loop do                          # Servers run forever
  Thread.start(server.accept) do |client|
    puts "Accepted the connection. Hello!"
    loop do
      resp = client.recv( 1024 )          # Read complete response
      print "=> "
      resp.bytes { |c| print c.to_s(16), ' ' }
      puts
      
      # Format a ACK MPF packet...
      ackPacket = [ 0x02,         # start of transmission
                    0x06,         # positive acknowledgement
                    1,            # last valid sequence received
                    0x03          # end of transmission
                    ].pack("cccc")

      # Compute LRC
      lrc = ackPacket.byteslice(1, ackPacket.bytesize-1).bytes.inject { |a,b| a ^ b }

      # Append LRC byte to the MPF packet
      ackPacket << lrc
      print "<= "
      ackPacket.bytes { |c| print c.to_s(16), ' ' }
      puts

      # Send the MPF packet
      client.send( ackPacket, 0 )
    end
  end
end