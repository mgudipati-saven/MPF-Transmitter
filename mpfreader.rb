require 'socket'                # Get sockets from stdlib

server = TCPServer.open(2000)   # Socket to listen on port 2000
loop do                          # Servers run forever
  Thread.start(server.accept) do |client|
    puts "Accepted the connection. Hello!"
    loop do
      resp = client.recv( 1024 )          # Read complete response
      resp.bytes { |c| print c.to_s(16), ' ' }
      puts
  	  client.puts "OK!"
    end
  end
end