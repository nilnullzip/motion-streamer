// Collect accelerometer samples and save to MongoDB collection named "samples".

console.log("foo");

Samples = new Meteor.Collection("samples"); // Get/create MongoDB collection

testdata = {samples: [1,2,3]}


if (Meteor.isClient) {

  var user_filter = function () {
    username = Session.get("username")
    if (username == undefined) {
      username = ""
    }
    //console.log("username: " + username)
    if (username=="ALL") {
      filter = {}
    } else {
      filter = {username: username}      
    }
    return filter;
  }

  // Live display of number of samples

  Template.nsamples.nsamples = function () {
    return Samples.find(user_filter()).count();
  };

  Template.nsamples.events({
    'click input#clear': function () {
      var filter = user_filter();
      console.log("Clearing samples for user: " + filter.username)
      if (filter.username == undefined && !confirm("Really?")) {
        console.log("Clearing cancelled.")
        return;
      }
      Samples.find(filter).forEach(function(d){Samples.remove(d._id)});
      console.log("Cleared samples for user: " + filter.username)
    }
  });

  Template.username.events({
    'keyup input#username': function () {
      Session.set("username", $("#username").val());
    }
  });

  // Username

  Template.username.events({
    'click input#startstop': function () {
      if ($("#startstop").val() == "Start capture") {
        $("#startstop").val("Stop capture")
      } else {
        $("#startstop").val("Start capture")
      }
    }
  });

  // JSON display

  Template.radios.samples_json = function(input){
    var samples = Samples.find(user_filter(), {sort: {created_at: 1}});
    var l = [];
    samples.forEach(function (s) {
      l = l.concat(s.samples);
    });
    return JSON.stringify(l);
  };

  // Recent samples display

  Template.radios.recentsamples = function () {
    var s = Samples.findOne(user_filter(), {sort: {created_at: -1}});
    if (s != null) {
      return _.map(s["samples"], JSON.stringify );
    } else {
      return [];
    }
  };

  // Manage radio buttons

  Template.radios.radio_value = function(input){
    return Session.get("radio_value") == input;
  };

  Template.radios.events({
    'click input': function () {
      Session.set("radio_value", $("input:radio[name=display]:checked").val())
    }
  });

  // At startup set up device motion event handler.

  Meteor.startup(function () {

    Session.set("radio_value", $("input:radio[name=display]:checked").val())
    var timestamp = 0;
    var samples = [];

    if (window.DeviceMotionEvent != undefined) {

      // Device motion event service routine!
            
      window.ondevicemotion = function(e) {

        // Inhibit saving

        if ($("#startstop").val() == "Start capture") {
          samples = [];
          return;
        }

        // Measure sample interval and siplay on page

        var t = Date.now();
        $("#measured").html(t - timestamp);
        $("#interval").html(e.interval);
        timestamp = t

        // Create the sample

        var sample = {}
        sample.x = e.accelerationIncludingGravity.x;
        sample.y = e.accelerationIncludingGravity.y;
        sample.z = e.accelerationIncludingGravity.z;
        $("#accx").html(sample.x);
        $("#accy").html(sample.y);
        $("#accz").html(sample.z);

        if ( e.rotationRate ) {
          sample.a = e.rotationRate.alpha;
          sample.b = e.rotationRate.beta;
          sample.c = e.rotationRate.gamma;
          $("#rota").html(sample.a);
          $("#rotb").html(sample.b);
          $("#rotc").html(sample.c);
        }
        sample.t = t;

        // Every 20 samples save record in mongoDB.

        samples.push(sample);
        if (samples.length > 20) {
          created_at = new Date().getTime();
          username = $("#username").val();
          Samples.insert({samples: samples, created_at: created_at, username: username});
          samples = [];
        }
      }
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // Stuff to run at startup on server goes here.
  });
}


// Server routes

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
      if (n != undefined) {
        n = Math.ceil(n/20);
      }
      console.log ("n: " + n)
      var samples = Samples.find(filter, {sort: {created_at: 1}, limit: n});
      var l = [];
      samples.forEach(function (s) {
        l = l.concat(s.samples);
      });

      this.response.writeHead(200, {'Content-Type': 'text/html'});
      this.response.end(JSON.stringify(l));
    }
  });
});
