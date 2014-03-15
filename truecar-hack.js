// Collect accelerometer samples and save to MongoDB collection named "samples".

Samples = new Meteor.Collection("samples"); // Get/create MongoDB collection

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

//  Handlebars.registerHelper('sessionvar',function(input){
//    return "var=" + Session.get(input);
//  });

  Template.body.activetab = function (t) {
//    console.log("activetab: " + Session.get("tabs"))
//    return true
    return (t == Session.get("tabs")) || (t == "#review" && !Session.get("tabs"));
  }

  Template.body.username = function (t) {
    return Session.get("username");
  }

  Template.body.events({
    'click button#startstop': function () {
      if ($("#startstop").text() == "Record") {
        $("#startstop").text("Stop")
      } else {
        $("#startstop").text("Record")
      }
    }
  });

  $(window).bind('hashchange', function() {
    console.log("hashchange: " + location.hash);
    Session.set("tabs", location.hash);
  });

  $(window).bind('popstate', function() {
    console.log("popstate: " + location.hash);
    Session.set("tabs", location.hash);
  });

  Template.tabs.rendered = function () {
    console.log("Template.tabs.rendered.")

    // Trigger when tab changes

    $('#maintabs a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
      console.log("BS: " + e.target.hash);
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
 
  // Recent samples display

  Template.body.recentsamples = function () {
    var s = Samples.findOne(user_filter(), {sort: {created_at: -1}});
    if (s != null) {
      return _.map(s["samples"], JSON.stringify );
    } else {
      return [];
    }
  };

  // Live display of number of samples

  Template.nsamples.nsamples = function () {
    return Samples.find(user_filter()).count();
  };

  Template.nsamples.events({
    'click input#clear': function () {
      var filter = user_filter();
      console.log("Clearing samples for user: " + Session.get("username"))
      if (filter.username == undefined && !confirm("Really?")) {
        console.log("Clearing cancelled.")
        return;
      }
      Samples.find(filter).forEach(function(d){Samples.remove(d._id)});
      console.log("Cleared samples for user: " + Session.get("username"))
    }
  });

  Template.username.events({
    'keyup input#username': function () {
      Session.set("username", $("#username").val());
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

        // Only save when capture button is enabled

        //if ($("#startstop").text() != "Stop" || Session.get("tabs") != "collecttab") {
        if ($("#startstop").text() != "Stop" || Session.get("tabs") != "#collect") {
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
      console.log ("records: " + records)
      var samples = Samples.find(filter, {sort: {created_at: -1}, limit: records});
      var l = [];
      samples.forEach(function (s) {
        l = l.concat(s.samples.reverse());
      });

      if (n != undefined) {
        l = l.slice(0,n);
      }

      l.reverse()

      this.response.writeHead(200, {'Content-Type': 'text/html'});
      this.response.end(JSON.stringify(l));
    }
  });
});
