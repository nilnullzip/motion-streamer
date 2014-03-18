#!/usr/bin/python

import urllib2
import json
import time

# Replace with your username

username = "Demo"

server = "truecar-hack.meteor.com"
#server = "localhost:3000"

# Process a sample -- replace with your processing function

last_t = 0
samples = []
def process_sample (s) :
	global last_t
	samples.append(s)
	print '%3d %d %6.2f %6.2f %6.2f  %6.2f %6.2f %6.2f' % \
		(s['t'] - last_t, s['t'], s['x'], s['y'], s['z'], s['a'], s['b'], s['c'])
	last_t = s['t']

# Stream data from server

def stream () :
	t = 0
	url = 'http://' + server + '/json/' + username
	while True :
		u = url + "?t=" + ("%d"%t)
		#print "downloading from t=%d" % t
		#print "url = " + u
		response = urllib2.urlopen(u)
		data = json.load(response)
		if data :
			for s in data :
				process_sample (s)
			t = data[-1]['t']
		time.sleep(1)

stream ()
