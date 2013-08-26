#!/bin/bash

STUNNEL_PID=/tmp/stunnel.pid
KANBAN_PID=/tmp/wrms-kanban.pid

(test -f $KANBAN_PID && kill $(cat $KANBAN_PID)) || echo "wrms-kanban not running"
killall stunnel4

