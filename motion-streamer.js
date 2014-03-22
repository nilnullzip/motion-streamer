// Collect accelerometer samples and save to MongoDB collection named "samples".
// Copyright 2014 Juan Pineda. See LICENSE (MIT) file.

Samples = new Meteor.Collection("samples"); // The sample collection
Counts = new Meteor.Collection("counts");   // Non Mongo counts collection

// Helper to get current user name

var get_username = function() {
  var u = Meteor.user();
  return u ? u.username : "";;
}

// Helper to formulate query

var user_filter = function (username) {
  return username=="ALL" ? {} : {username: username==undefined ? "" : username};
}

if (Meteor.isClient) {

  // Helper to get session variables

  Handlebars.registerHelper('sessionvar',function(v){
    var val = Session.get(v);
    return val;
  });

  Handlebars.registerHelper('origin',function(){
    return window.location.origin
  });

  // Body functions

  Template.body.activetab = function (t) {
    return (t == Session.get("tabs")) || (t == "#review" && !Session.get("tabs"));
  }

  Template.body.username = function () {
    return get_username();
  }

  Template.body.has_username = function () {
    var username = get_username();
    return username != "" && username != undefined;
  }

  Template.body.events({
    'click button#clear': function () {
      var filter = user_filter(get_username());
      if (filter.username == undefined && !confirm("Really?")) {
        return;
      }      
      Meteor.call("delete_samples", filter);
    }
  });

  // Recent samples display

  var last_t;
  var format_sample = function (s) {
    r = sprintf("%4d %d  %6.2f %6.2f %6.2f   %6.1f %6.1f %6.1f", 
      s['t']-last_t, s['t'], 
      s['x'], s['y'], s['z'],
      s['a'], s['b'], s['c']);
    last_t = s['t'];
    return r;
  }

  Template.recentdata.recentsamples = function () {
    var s = Samples.findOne(user_filter(get_username()), {sort: {created_at: -1}});
    if (s != null) {
      if (!last_t) {
        last_t = s["samples"][0]['t'];        
      }
      return _.map(s["samples"], format_sample );
    } else {
      return [];
    }
  };

  Template.recentdata.time_limit = function () {
    return time_limit;
  }

  // Handle history via location hash

  $(window).bind('popstate', function() {
    Session.set("tabs", location.hash);
  });

  // Navigation tab wiring

  Template.body.rendered = function () {

    // Handler to set tabs session variable whenever tab is shown

    $('#maintabs a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
      Session.set("tabs", e.target.hash);
    });

    // Explicitly show tab content 
    // because the Bootstrap data-toggle mechanism doesn't work with Meteor
    // because tab content is not propery rendered before the toggle is executed.
    // Maybe unnecessary with Meteor 0.8 because it does not rebuild the entire DOM.

    if (Session.get("tabs")) {
      $('#maintabs ' + Session.get("tabs") + "tab").tab("show");
    } else {
      $('#maintabs a[data-toggle="tab"]:first').tab("show"); // On startup initalize first tab.
    }
  }
  
  // Live display of number of samples

  var time_limit = 10 * 60;

  Template.nsamples.nsamples = function () {
    var s = Counts.findOne(); // This can return null during startup!
    if (!s) return "nsamples: Oops!";
    var count = s.count;
    if (count>time_limit) set_recording(false); // Limit recording time.
    return count;
  };
 
  Template.nsamples.recording = function () {
    var u = Meteor.user();
    return u != undefined && u.profile && u.profile.recording;
  }

  // Set the recording state

  var set_recording = function(recording) {
    if (recording && Counts.findOne() && Counts.findOne().count) {
      alert("Please delete samples first.");
      if (Meteor.user().username != "Juan") return;
    }
    Meteor.users.update(Meteor.userId(), {$set: {'profile.recording': recording}});

    reset_timeout(recording);
  }

  // Timeout if no recording and reset record button

  var timeout = null;
  var reset_timeout = function(recording){
    clearTimeout(timeout);
//    return; // ***************** DEBUG *****************
    if (!recording) {
      return;
    }
    timeout = Meteor.setTimeout(function(){
      set_recording(false);
    }, 10000)
  }

  Deps.autorun(function(){
    var s = Samples.findOne(user_filter(get_username()), {sort: {created_at: -1}});
    reset_timeout(true);
  });

  // The recording button

  Template.recording.recording = function () {
      var u = Meteor.user();
      return u != undefined && u.profile && u.profile.recording;
  }

  Template.recording.events({
    'click button#startstop': function () {
      set_recording(!Template.recording.recording());
    }
  });

  Template.status.status = function () {
    s = Meteor.status()['status']
    if (s=="connected") {
      r = 'muted' ;
      $('#statusModal').modal('hide');
    } else if (s=="connecting") {
      r = 'text-warning' ;
      $('#statusModal').modal('show');
    } else {
      r = 'text-error';
      s = s + '!'
      $('#statusModal').modal('show');
    }
    if (Meteor.status()['reason']) s += " " + Meteor.status()['reason']
    if (Meteor.status()['retryCount']) s += " (" + Meteor.status()['retryCount'] + ")"
    $('#statusModal #statusModalLabel').html("<span class='" + r + "'>Server status: " + s + "</span>");
    return new Handlebars.SafeString("<span class='" + r + "'>" + s + "</span>");
  }

  Deps.autorun(Template.status.status);

  var device_motion_timout = 0;

  $(Meteor.setInterval(function(){
    device_motion_timout++;
  }, 1000));

  // At startup set up device motion event handler.

  Deps.autorun(function () {
    var username = get_username();
    if (!username) return;
    Meteor.subscribe ("counts", username);
  });

  Deps.autorun(function () {
    var username = get_username();
    if (!username) return;
    Meteor.subscribe ("recent_samples", username);
  });
 
  Meteor.startup(function () {

    Accounts.ui.config({
      passwordSignupFields: 'USERNAME_ONLY'
    });

    var timestamp = 0;
    var samples = [];

    if (window.DeviceMotionEvent != undefined) {

      // Device motion event service routine!
            
      window.ondevicemotion = function(e) {

        device_motion_timout = 0;

        var s = "Raw motion data:<br><br>";

        // Measure sample interval and display on page

        var t = Date.now();
        s += sprintf("Sample period:     %3.0f ms<br>", (t - timestamp));
        s += sprintf("API sample period: %3.0f ms<br><br>", Math.floor(e.interval*1000));
        timestamp = t

        // Create the sample

        var sample = {}
        sample.x = e.accelerationIncludingGravity.x;
        sample.y = e.accelerationIncludingGravity.y;
        sample.z = e.accelerationIncludingGravity.z;
        if ( e.rotationRate ) {
          sample.a = e.rotationRate.alpha;
          sample.b = e.rotationRate.beta;
          sample.c = e.rotationRate.gamma;
        }
        sample.t = t;

        // Live update (Only when not recording)

        if (!Template.recording.recording() || Session.get("tabs") != "#collect") {
          samples = [];

          s += sprintf("Time: %f<br><br>", sample['t']);
          s += sprintf("Acc:  %6.2f %6.2f %6.2f<br>", sample['x'], sample['y'], sample['z']);
          if ( e.rotationRate ) {
          s += sprintf("Rot:  %6.1f %6.1f %6.1f<br>", sample['a'], sample['b'], sample['c']);
          }

          $("#accxyz").html(s);
          return;
        }
        $("#accxyz").html("Collecting...");

        // Every 20 samples save record in mongoDB.

        samples.push(sample);
        if (samples.length >= 20) {
          created_at = t;
          var username = get_username();
          Samples.insert({samples: samples, created_at: created_at, username: username});
          samples = [];
        }
      }
    }
  });
}

// Server

if (Meteor.isServer) {

  Samples.allow({
    insert: function (id, doc) { // Allow user to delete their own documents
      return doc.username == Meteor.user().username;
    }
  });

  Meteor.methods({
    // Because Meteor does not allow client to delete multiple documents
    delete_samples: function(filter) {
      Samples.remove(filter);
    }
  });

  Meteor.publish("counts", function (username) {
    var initializing = true; // Not sure if this is needed. Copied from example.
    var self = this; // Needed to capture value of this for function closures.
    var s = Samples.find(user_filter(username), {fields: {_id: 1}});
    var handle = s.observeChanges({
      added : function (id) {
        if (!initializing) {
          self.changed("counts", username, {count: s.count()});          
        }
      },
      removed : function (id) {
        if (!initializing) {
          self.changed("counts", username, {count: s.count()});          
        }
      }
    });
    var count = s.count();
    initializing = false;
    //console.log("publish counts: " + username + " " + count);
    self.added("counts", username, {count: count});
    self.ready();
    self.onStop(function () {
      handle.stop();
    });
  });

  Meteor.publish("recent_samples", function (username) {
    var s = Samples.find(user_filter(username), {sort: {created_at: -1}, limit: 1});
    //console.log("recent_samples: " + username + " " + s.count());
    s.rewind();
    return s;
  });

  Meteor.startup(function () {
    Samples._ensureIndex({created_at: -1, username: 1})
  });
}

// Server routes

Router.configure({
  notFoundTemplate: 'notFound' // this will render
});

Router.map(function () {
  this.route('body', {
    path: '/'
  });
});

Router.map(function () {
  this.route('json', {
    where: 'server',
    path: '/json/:username',

    action: function () {
      var username = this.params.username;
      //console.log("JSON: username: " + username);
      //console.log("JSON: n: " + this.params.n);
      var filter = {}

      if (username != "ALL") {
        filter = {username: username};
      }

      var t = this.params.t;
      if (t != undefined) {
        //console.log("JSON: from time: " + t)
        filter['created_at'] = {$gt : parseInt(t)};
      }

      //console.log("JSON: query: " + JSON.stringify(filter));
      var seconds = this.params.n;
      var skip = 0; // Default skip nothing
      if (seconds != undefined) {
        var nrecords = Samples.find(filter).count();
        seconds = Math.max(seconds, 2); // Need at least two seconds for slop
        skip = Math.max(0, nrecords-seconds);
      }
      var samples = Samples.find(filter, {sort: {created_at: 1}, skip: skip});
      var l = [];
      samples.forEach(function (s) {
        l = l.concat(s.samples);
      });

      this.response.writeHead(200, {'Content-Type': 'application/json', 'Content-Disposition': 'attachment'});
      this.response.end(JSON.stringify(l));
    }
  });
});
