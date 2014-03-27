// Collect accelerometer samples and save to MongoDB collection named "samples".
// Copyright 2014 Juan Pineda. See LICENSE (MIT) file.

Samples = new Meteor.Collection("samples"); // The sample collection
Counts = new Meteor.Collection("counts");   // Non Mongo counts collection
Timestamps = new Meteor.Collection("timestamps");

var time_limit = 60;

// Helper to get current user name

var get_username = function() {
  var u = Meteor.user();
  return u ? u.username : "";;
}

// Helper to formulate query

var user_filter = function (username) {
  return {username: username==undefined ? "" : username};
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
      Meteor.call("delete_samples", filter);
      set_recording(is_recording()); // update recording timestamp
    }
  });

  // Server timestamp display for debugging purposes

  Template.timestamp.timestamp = function () {
    var ts = get_timestamp();
    if (!ts) return;
    return ts - Date.now();
  };

  var get_timestamp = function () {
    t = Timestamps.findOne();
    if (!t) return 0;
    return t.timestamp;
  }

  Meteor.subscribe("timestamps", 1);
 
  // Recent samples display

  var timestamps = [];
  var format_sample = function (s) {
    r = sprintf("%4d %d  %6.2f %6.2f %6.2f   %6.2f %6.2f %6.2f   %6.1f %6.1f %6.1f", 
      s['t']-timestamps[0], s['t'], 
      s['X'], s['Y'], s['Z'],
      s['x'], s['y'], s['z'],
      s['a'], s['b'], s['c']);
    timestamps[0] = s['t'];
    return r;
  }

  Template.recentdata.recentsamples = function () {
    var s = Samples.findOne(user_filter(get_username()), {sort: {created_at: -1}, limit: 1});
    if (s != null) {
      if (!timestamps.length) {
        timestamps.unshift(s["samples"][0]['t']);        
        timestamps.unshift(timestamps[0]);        
      } else if (timestamps[0] == s["samples"][19]['t']) {
        timestamps[0] = timestamps[1];
      } else {
      }
      timestamps.unshift(timestamps[0]);
      r = _.map(s["samples"], format_sample );
      timestamps.pop();
      return r;
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

  Template.nsamples.nsamples = function () {
    var s = Counts.findOne(); // This can return null during startup!
    if (!s) return "nsamples: Oops!";
    return s.count;
  };
 
  var is_recording = function () {
    var u = Meteor.user();
    if (!u || !u.profile) return false;
    var ts = Timestamps.findOne();
    if (!ts) return false;
    return ts.timestamp - u.profile.recording < time_limit*1000;
  }

  Template.nsamples.recording = function () {
    return is_recording();
  }

  // Set the recording state

  var set_recording = function(recording) {
    recording_val = recording ? Date.now() : null;
    Meteor.users.update(Meteor.userId(), {$set: {'profile.recording': recording_val}});
  }

  // The recording button

  Template.recording.recording = function () {
    return is_recording();
  }

  Template.recording.events({
    'click button#startstop': function () {
      var recording = is_recording();
      if (!recording && Counts.findOne() && Counts.findOne().count) {
        alert("Please delete samples first.");
        if (Meteor.user().username != "Juan") return;
      }
      set_recording(!recording);
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

  Deps.autorun(Template.status.status); // Not sure why this one is needed

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

        var s = "";

        // Measure sample interval and display on page

        var t = Date.now();
        s += sprintf("Sample period:     %3.0f ms<br>", (t - timestamp));
        s += sprintf("API sample period: %3.0f ms<br><br>", Math.floor(e.interval*1000));
        timestamp = t

        // Create the sample

        var sample = {}
        sample.X = e.accelerationIncludingGravity.x;
        sample.Y = e.accelerationIncludingGravity.y;
        sample.Z = e.accelerationIncludingGravity.z;
        if (e.acceleration) {
          sample.x = e.acceleration.x;
          sample.y = e.acceleration.y;
          sample.z = e.acceleration.z;
        }
        if ( e.rotationRate ) {
          sample.a = e.rotationRate.alpha;
          sample.b = e.rotationRate.beta;
          sample.c = e.rotationRate.gamma;
        }
        sample.t = t;

        // Live update (Only when not recording)

        if (!is_recording() || Session.get("tabs") != "#collect") {
          samples = [];

          s += sprintf("Timestamp: %f<br><br>", sample['t']);
          s += sprintf("Acc:   %6.2f %6.2f %6.2f<br>", sample['X'], sample['Y'], sample['Z']);
          if ( e.acceleration ) {
          s += sprintf("Acc-g: %6.2f %6.2f %6.2f<br>", sample['x'], sample['y'], sample['z']);
          }
          if ( e.rotationRate ) {
          s += sprintf("Rot:   %6.1f %6.1f %6.1f<br>", sample['a'], sample['b'], sample['c']);
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

  var set_recording = function(username, recording) {
    u = Meteor.users.findOne({username: username});
    recording_val = recording ? Date.now() : null;
    Meteor.users.update(u._id, {$set: {'profile.recording': recording_val}});
  };

  var get_recording = function(username, recording) {
    u = Meteor.users.findOne({username: username});
    if (!u) return undefined;
    if (!u.profile) return undefined;
    return u.profile.recording;
  };

  Meteor.methods({
    // Because Meteor does not allow client to delete multiple documents
    delete_samples: function(filter, n) {
      if (n==undefined) {
        Samples.remove(filter);        
      } else if (n>0) {
        var ids = Samples.find(filter,{sort: {created_at: 1}, limit: n, fields: {_id: 1}}).fetch();
        ids = ids.map(function(i){return i._id});
        Samples.remove({_id: {'$in': ids}});
        return
      }
    },
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
    self.added("counts", username, {count: count});
    self.ready();
    self.onStop(function () {
      handle.stop();
    });
  });

  Meteor.publish("recent_samples", function (username) {
    var s = Samples.find(user_filter(username), {sort: {created_at: -1}, limit: 1});
    s.rewind();
    return s;
  });

  Meteor.publish("timestamps", function (x) {
    var self = this; // Needed to capture value of this for function closures.
    self.added("timestamps", "0", {timestamp: Date.now()});
    Meteor.setInterval(function (){
      self.changed("timestamps", "0", {timestamp: Date.now()});
    }, 1000)
    self.ready();
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
      // set recording, but not too frequently because changes to user record bog down browser
      var recording = get_recording(username);
      if (!recording || recording && Date.now() > recording + time_limit/2*1000) {
        set_recording(username, Date.now());
      }
      var filter = {username: username};

      var t = this.params.t;
      if (t != undefined) {
        filter['created_at'] = {$gt : parseInt(t)};
      }

      var seconds = 5; // Need at least 2 seconds to allow for occasional catchup
      if (this.params.n == undefined) seconds = time_limit;
      var skip = 0; // Default skip nothing
      var nrecords = Samples.find(filter).count();
      skip = Math.max(0, nrecords-seconds);

      var samples = Samples.find(filter, {sort: {created_at: 1}, skip: skip});

      // Get samples and form response

      var nrecords_fetched = 0;
      var l = [];
      samples.forEach(function (s) {
        l = l.concat(s.samples);
        nrecords_fetched++;
      });

      this.response.writeHead(200, {'Content-Type': 'application/json', 'Content-Disposition': 'attachment'});
      this.response.end(JSON.stringify(l));

      // Delete samples as we stream them

      var total_records = Samples.find({username: username}).count();
      var ndelete = 0;
      if (total_records > time_limit) ndelete = total_records - time_limit;
//      else if (total_records - nrecords_fetched > 10) ndelete = nrecords_fetched;
      Meteor.call("delete_samples", {username: username}, ndelete);

    }
  });
});
