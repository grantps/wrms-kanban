dep:
	npm install -d

start:
	test -n "$$(ps $$(cat /tmp/stunnel.pid))" || stunnel -d 27601 -p stunnel.pem -r 27600 -P /tmp/stunnel.pid
	node ./server.js
