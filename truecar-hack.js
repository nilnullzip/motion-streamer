// Collect accelerometer samples and save to MongoDB collection named "samples".

Samples = new Meteor.Collection("samples"); // Get/create MongoDB collection
Users = new Meteor.Collection("tcusers");

if (Meteor.isClient) {

  // Helper to get session variables

  Handlebars.registerHelper('sessionvar',function(v){
    var val = Session.get(v);
    //console.log("sessionvar: " + v + "=" + val)
    return val;
  });

  // Helper to formulate query
 
  var user_filter = function () {
    var username = Session.get("username")
    if (username == undefined) {
      username = ""
    }
    if (username=="ALL") {
      filter = {}
    } else {
      filter = {username: username}
    }
    return filter;
  }

  // Body functions

  Template.body.activetab = function (t) {
    return (t == Session.get("tabs")) || (t == "#review" && !Session.get("tabs"));
  }

  Template.body.has_username = function () {
    //console.log("has_username: " + Session.get("username"));
    var u = Session.get("username");
    return u != "" && u != undefined;
  }

  // Recent samples display

  Template.body.recentsamples = function () {
    var s = Samples.findOne(user_filter(), {sort: {created_at: -1}});
    if (s != null) {
      return _.map(s["samples"], JSON.stringify );
    } else {
      return [];
    }
  };

  Template.body.events({
    'click button#clear': function () {
      var filter = user_filter();
      console.log("Clearing samples for user: " + Session.get("username"))
      if (filter.username == undefined && !confirm("Really?")) {
        console.log("Clearing cancelled.")
        return;
      }      
      Meteor.call("clear", filter);
      //Samples.find(filter).forEach(function(d){Samples.remove(d._id)});
      console.log("Cleared samples for user: " + Session.get("username"))
    }
  });

  // Navigation tabs

  $(window).bind('hashchange', function() {
    console.log("hashchange: " + location.hash);
    Session.set("tabs", location.hash);
  });

  $(window).bind('popstate', function() {
    //console.log("popstate: " + location.hash);
    Session.set("tabs", location.hash);
  });

  Template.tabs.rendered = function () {
    //console.log("Template.tabs.rendered.")

    // Trigger when tab changes

    $('#maintabs a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
      //console.log("BS: " + e.target.hash);
      Session.set("tabs", e.target.hash);
//      console.log("BS: " + location.hash);
//      Session.set("tabs", location.hash);
    });

    // Initialize the tab

    if (Session.get("tabs")) {
      //console.log("Template.tabs.rendered: tabs=" + Session.get("tabs"))
      //$('#maintabs #' + Session.get("tabs")).tab("show");
      $('#maintabs ' + Session.get("tabs") + "tab").tab("show");
    } else {
      $('#maintabs a[data-toggle="tab"]:first').tab("show");
    }

  }
  
  // Live display of number of samples

  Template.nsamples.nsamples = function () {
    return Samples.find(user_filter()).count();
  };

  Template.nsamples.recording = function () {
    return Template.recording.recording();
  };

  // Set the recording state

  var set_recording = function(recording) {
    var username = Session.get("username");
    if (!username) {
      return;
    }
    if (recording && Samples.find(user_filter()).count()) {
      alert("Please delete samples first.");
      return;
    }
    //console.log("set_recording: " + recording)
    Users.remove(username);
    Users.insert({_id: username, recording: recording});
//        Users.upsert(username, {_id: username, recording: r});
    reset_timeout(recording);
  }

  // Timeout if no recording and reset record button

  var timeout = null;
  var reset_timeout = function(recording){
    clearTimeout(timeout);
    if (!recording) {
      //console.log("reset_timeout: canceling check.");
      return;
    }
    //console.log("Setting recording timeout")
    timeout = Meteor.setTimeout(function(){
      //console.log("Setting record button to record")
      set_recording(false);
    }, 5000)
  }

  Deps.autorun(function(){
    var s = Samples.findOne(user_filter(), {sort: {created_at: -1}});
    reset_timeout(true);
  });

  // The recording button

  Template.recording.recording = function () {
      var username = Session.get("username");
      var u = Users.findOne(username);
      console.log("recording: " + JSON.stringify(u))
      return u != undefined && u.recording;
  }

  Template.recording.events({
    'click button#startstop': function () {
      //if ($("#startstop").text() == "Record") {
      set_recording(!Template.recording.recording());
    }
  });

  // Disable record button

  Template.recording.rendered = function () {
    if (device_motion_timout) {
      $("#collect button#startstop").attr("disabled", "")
    } else {
      $("#collect button#startstop").attr("disabled", null)      
    }
  }

  // Username field

  Template.username.events({
    'keyup input#username': function () {
//    'blur input#username': function () {
      Session.set("username", $("#username").val());
    }
  });

  Deps.autorun(function(){
    var u = Meteor.user();
    if (!u) {
      Session.set("username", null);
      return;
    } 
    Session.set("username", Meteor.user().username);
  });

  var device_motion_timout = 0;

  $(Meteor.setInterval(function(){
    device_motion_timout++;
  }, 1000));

  // At startup set up device motion event handler.

  Meteor.startup(function () {

    Accounts.ui.config({
      passwordSignupFields: 'USERNAME_ONLY'
    });

    //Session.set("radio_value", $("input:radio[name=display]:checked").val())
    var timestamp = 0;
    var samples = [];

    if (window.DeviceMotionEvent != undefined) {

      // Device motion event service routine!
            
      window.ondevicemotion = function(e) {

        device_motion_timout = 0;

        var s = "";

        //if ($("#startstop").text() != "Stop" || Session.get("tabs") != "collecttab") {
        // Measure sample interval and siplay on page

        var t = Date.now();
        s += "measured sample period: " + (t - timestamp) + " ms<br>";
        s += "API sample period: " + Math.floor(e.interval*1000) + " ms<br>";
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

        //if ($("#startstop").text().trim() != "Stop" || Session.get("tabs") != "#collect") {
        if (!Template.recording.recording() || Session.get("tabs") != "#collect") {
          samples = [];
          //if ($("#startstop").text().trim() == "Record") {
          //if (!Template.recording.recording()) {
            s += "accx: " + sample.x + "<br/>";
            s += "accy: " + sample.y + "<br/>";
            s += "accz: " + sample.z + "<br/>";
            if ( e.rotationRate ) {
              s += "rota: " + sample.a + "<br/>";
              s += "rota: " + sample.b + "<br/>";
              s += "rota: " + sample.b + "<br/>";
            }
          //}
          $("#accxyz").html(s);
          return;
        }
        $("#accxyz").html("Collecting...");

        // Every 20 samples save record in mongoDB.

        samples.push(sample);
        if (samples.length > 20) {
          created_at = new Date().getTime();
          var username = Session.get("username");
          Samples.insert({samples: samples, created_at: created_at, username: username});
          samples = [];
        }
      }
    }
  });
}

// Server

if (Meteor.isServer) {
  Meteor.methods({
    clear: function(filter) {
      var username = "ALL"
      console.log("clear: " + JSON.stringify(filter));
      if (!filter) {
        username = filter.username;
      }
      console.log("Clearing samples for user: " + username);
      //Samples.find(filter).forEach(function(d){Samples.remove(d._id)});
      Samples.remove(filter);
      console.log("Cleared samples for user: " + username);
    }
  });

  Meteor.startup(function () {
    // Stuff to run at startup on server goes here.
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
      console.log("JSON: username: " + username);
      console.log("JSON: n: " + this.params.n);
      var filter = {}

      if (username != "ALL") {
        filter = {username: username};
      }

      var n = this.params.n;
      var records = n
      if (n != undefined) {
        records = Math.ceil(n/20);
      }
      //console.log ("records: " + records)
      var samples = Samples.find(filter, {sort: {created_at: -1}, limit: records});
      var l = [];
      samples.forEach(function (s) {
        l = l.concat(s.samples.reverse());
      });

      if (n != undefined) {
        l = l.slice(0,n);
      }

      l.reverse()

      //this.response.writeHead(200, {'Content-Type': 'text/html'});
      this.response.writeHead(200, {'Content-Type': 'application/json', 'Content-Disposition': 'attachment'});
      this.response.end(JSON.stringify(l));
    }
  });
});
