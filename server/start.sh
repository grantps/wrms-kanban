#!/bin/bash

STUNNEL_PID=/tmp/stunnel.pid
KANBAN_PID=/tmp/wrms-kanban.pid

(test -f $STUNNEL_PID && test -n "$(ps $(cat $STUNNEL_PID))") || stunnel -d 27601 -p stunnel.pem -r 27600 -P $STUNNEL_PID
node ./server.js &
echo $! > $KANBAN_PID

