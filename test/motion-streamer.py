#!/usr/bin/python

import urllib2
import json
import time
import sys

# Replace with your username and server

username = "Demo"
#server = "truecar-hack.meteor.com"
server = "http://localhost:3000"

# Process a sample -- replace with your processing function

last_t = 0
samples = []
def process_sample (s) :
	global last_t
	samples.append(s)
	delta = s['t'] - last_t
	if delta > 1000 :
		print "Discontinuity %d ms" % delta
	elif delta > 200 :
		print "Delayed"
	print '%3d %d %6.2f %6.2f %6.2f  %6.2f %6.2f %6.2f  %6.2f %6.2f %6.2f' % \
		(delta, s['t'], s['X'], s['Y'], s['Z'], s['x'], s['y'], s['z'], s['a'], s['b'], s['c'])
	last_t = s['t']

# Stream data from server

def stream () :
	t = 0
	url = server + '/json/' + username
	while True :
		# t asks for samples since that timestamp
		u = url + "?t=" + ("%d"%t) + "&n=5"
		response = urllib2.urlopen(u)
		json_text = response.read()
		if (len(json_text)>2) :
			data = json.loads(json_text)
			if data :
				for s in data :
					process_sample (s)
				t = data[-1]['t']
		else :
			print "\rwaiting...\r",
			sys.stdout.flush()
		time.sleep(1)

stream ()
